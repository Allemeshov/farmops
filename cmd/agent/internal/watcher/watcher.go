// Package watcher implements the agent's main observation loop.
// It watches the Kubernetes API server for pod events and, for Phase 0,
// runs a basic pod health check on a configurable interval.
package watcher

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/farmops/farmops/cmd/agent/internal/config"
	"github.com/farmops/farmops/pkg/proof"
	"github.com/farmops/farmops/pkg/transport"
)

// Watcher is the agent's main observation loop.
type Watcher struct {
	cfg     *config.Config
	log     *slog.Logger
	k8s     kubernetes.Interface
	client  *transport.TrackerClient
	privKey []byte // raw Ed25519 private key bytes, decoded from cfg.PrivateKeyHex
}

// New creates a new Watcher, initialising the Kubernetes client and tracker transport.
func New(cfg *config.Config, log *slog.Logger) (*Watcher, error) {
	privKey, err := proof.DecodePrivateKey(cfg.PrivateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("watcher: decode private key: %w", err)
	}

	k8sClient, err := buildK8sClient(cfg.Kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("watcher: build k8s client: %w", err)
	}

	trackerClient := transport.NewTrackerClient(cfg.TrackerURL, cfg.APIKey)

	return &Watcher{
		cfg:     cfg,
		log:     log,
		k8s:     k8sClient,
		client:  trackerClient,
		privKey: privKey,
	}, nil
}

// Run starts the observation loop and blocks until ctx is cancelled.
func (w *Watcher) Run(ctx context.Context) error {
	w.log.Info("watcher: starting pod health observation loop")

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	// Run immediately on start, then on each tick.
	if err := w.observePodHealth(ctx); err != nil {
		w.log.Warn("watcher: pod health observation failed", "error", err)
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := w.observePodHealth(ctx); err != nil {
				w.log.Warn("watcher: pod health observation failed", "error", err)
			}
		}
	}
}

// observePodHealth lists all pods across all namespaces, checks their phase,
// and emits a FarmProof if the observation is verifiable.
func (w *Watcher) observePodHealth(ctx context.Context) error {
	pods, err := w.k8s.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list pods: %w", err)
	}

	total := len(pods.Items)
	healthy := 0
	crashLooping := 0

	for _, pod := range pods.Items {
		if isPodHealthy(&pod) {
			healthy++
		}
		if isCrashLooping(&pod) {
			crashLooping++
		}
	}

	w.log.Info("watcher: pod health check",
		"total", total,
		"healthy", healthy,
		"crash_looping", crashLooping,
	)

	// Only emit a verified proof if all pods are healthy.
	if crashLooping > 0 || healthy < total {
		w.log.Info("watcher: cluster not fully healthy, skipping proof", "crash_looping", crashLooping)
		return nil
	}

	// Build evidence (kept locally, only its hash goes into the proof).
	evidenceJSON := fmt.Sprintf(`{"total":%d,"healthy":%d,"crash_looping":%d}`, total, healthy, crashLooping)

	agent := proof.AgentInfo{
		AgentID:      w.cfg.AgentID,
		ClusterAlias: w.cfg.ClusterAlias,
	}
	actor := proof.ActorInfo{
		ActorHash: proof.HashActor("agent:" + w.cfg.AgentID),
		ActorType: proof.ActorSystem,
	}
	action := proof.ActionInfo{
		Plugin:      "farmops/k8s-pod-health",
		ActionType:  proof.ActionVerify,
		Category:    proof.CategoryMaintenance,
		Description: fmt.Sprintf("Verified pod health: %d/%d pods healthy", healthy, total),
	}
	outcome := proof.OutcomeInfo{
		Status:       proof.OutcomeSuccess,
		Verified:     true,
		EvidenceHash: proof.HashEvidence([]byte(evidenceJSON)),
	}

	complexity := proof.ComplexityLow
	if total > 100 {
		complexity = proof.ComplexityMedium
	}
	hints := proof.ScoringHints{
		Complexity:       complexity,
		ImpactRadius:     clamp(total/10, 1, 10),
		ArtifactsTouched: total,
	}

	p, err := proof.New(agent, actor, action, outcome, hints, nil)
	if err != nil {
		return fmt.Errorf("build proof: %w", err)
	}

	if err := proof.Sign(p, w.privKey); err != nil {
		return fmt.Errorf("sign proof: %w", err)
	}

	resp, err := w.client.SubmitProof(ctx, p)
	if err != nil {
		return fmt.Errorf("submit proof: %w", err)
	}

	if !resp.Accepted {
		w.log.Warn("watcher: proof rejected by tracker", "reason", resp.RejectionReason)
		return nil
	}

	w.log.Info("watcher: proof accepted", "proof_id", p.ProofID, "coins_awarded", resp.CoinsAwarded)
	return nil
}

func isPodHealthy(pod *corev1.Pod) bool {
	return pod.Status.Phase == corev1.PodRunning || pod.Status.Phase == corev1.PodSucceeded
}

func isCrashLooping(pod *corev1.Pod) bool {
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
			return true
		}
	}
	return false
}

func clamp(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func buildK8sClient(kubeconfig string) (kubernetes.Interface, error) {
	var restCfg *rest.Config
	var err error

	if kubeconfig != "" {
		restCfg, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
	} else {
		restCfg, err = rest.InClusterConfig()
	}
	if err != nil {
		return nil, fmt.Errorf("k8s config: %w", err)
	}

	return kubernetes.NewForConfig(restCfg)
}
