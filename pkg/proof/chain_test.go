package proof_test

import (
	"testing"

	"github.com/farmops/farmops/pkg/proof"
)

func TestChain_ValidGenesis(t *testing.T) {
	pub, priv, err := proof.GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}

	agent := proof.AgentInfo{AgentID: "agent-1", ClusterAlias: "test-cluster"}
	actor := proof.ActorInfo{ActorHash: proof.HashActor("github:testuser"), ActorType: proof.ActorHuman}
	action := proof.ActionInfo{
		Plugin:      "farmops/k8s-pod-health",
		ActionType:  proof.ActionVerify,
		Category:    proof.CategoryMaintenance,
		Description: "All pods healthy",
	}
	outcome := proof.OutcomeInfo{
		Status:       proof.OutcomeSuccess,
		Verified:     true,
		EvidenceHash: proof.HashEvidence([]byte(`{"pods":52,"healthy":52}`)),
	}
	hints := proof.ScoringHints{Complexity: proof.ComplexityLow, ImpactRadius: 3, ArtifactsTouched: 52}

	p, err := proof.New(agent, actor, action, outcome, hints, nil)
	if err != nil {
		t.Fatal(err)
	}

	if err := proof.Sign(p, priv); err != nil {
		t.Fatal(err)
	}

	if err := proof.Chain([]*proof.FarmProof{p}, pub); err != nil {
		t.Errorf("valid genesis chain failed: %v", err)
	}
}

func TestChain_ValidSequence(t *testing.T) {
	pub, priv, err := proof.GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}

	agent := proof.AgentInfo{AgentID: "agent-1", ClusterAlias: "test-cluster"}
	actor := proof.ActorInfo{ActorHash: proof.HashActor("github:testuser"), ActorType: proof.ActorHuman}

	var proofs []*proof.FarmProof
	var prev *proof.FarmProof

	for i := 0; i < 3; i++ {
		action := proof.ActionInfo{
			Plugin:      "farmops/k8s-pod-health",
			ActionType:  proof.ActionVerify,
			Category:    proof.CategoryMaintenance,
			Description: "Health check",
		}
		outcome := proof.OutcomeInfo{Status: proof.OutcomeSuccess, Verified: true, EvidenceHash: "abc123"}
		hints := proof.ScoringHints{Complexity: proof.ComplexityLow, ImpactRadius: 1}

		p, err := proof.New(agent, actor, action, outcome, hints, prev)
		if err != nil {
			t.Fatal(err)
		}
		if err := proof.Sign(p, priv); err != nil {
			t.Fatal(err)
		}
		proofs = append(proofs, p)
		prev = p
	}

	if err := proof.Chain(proofs, pub); err != nil {
		t.Errorf("valid chain failed: %v", err)
	}
}

func TestChain_TamperedProof(t *testing.T) {
	pub, priv, err := proof.GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}

	agent := proof.AgentInfo{AgentID: "agent-1", ClusterAlias: "test-cluster"}
	actor := proof.ActorInfo{ActorHash: proof.HashActor("github:testuser"), ActorType: proof.ActorHuman}

	var proofs []*proof.FarmProof
	var prev *proof.FarmProof

	for i := 0; i < 2; i++ {
		action := proof.ActionInfo{Plugin: "farmops/k8s-pod-health", ActionType: proof.ActionVerify, Category: proof.CategoryMaintenance, Description: "check"}
		outcome := proof.OutcomeInfo{Status: proof.OutcomeSuccess, Verified: true, EvidenceHash: "abc"}
		hints := proof.ScoringHints{Complexity: proof.ComplexityLow}
		p, _ := proof.New(agent, actor, action, outcome, hints, prev)
		_ = proof.Sign(p, priv)
		proofs = append(proofs, p)
		prev = p
	}

	// Tamper with the first proof after signing.
	proofs[0].ScoringHints.ImpactRadius = 99

	if err := proof.Chain(proofs, pub); err == nil {
		t.Error("expected chain validation to fail on tampered proof, but it passed")
	}
}
