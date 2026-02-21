// Command farmops-agent is the Farm Agent binary.
// It runs inside a Kubernetes cluster, observes infrastructure activity via
// plugins, and submits signed FarmProof records to the Stats Tracker.
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/farmops/farmops/cmd/agent/internal/config"
	"github.com/farmops/farmops/cmd/agent/internal/watcher"
)

func main() {
	cfgPath := flag.String("config", "agent.yaml", "path to agent config file")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		slog.Error("failed to load config", "error", err, "path", *cfgPath)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	slog.Info("farmops-agent starting",
		"agent_id", cfg.AgentID,
		"cluster_alias", cfg.ClusterAlias,
		"tracker_url", cfg.TrackerURL,
	)

	w, err := watcher.New(cfg, logger)
	if err != nil {
		slog.Error("failed to initialise watcher", "error", err)
		os.Exit(1)
	}

	if err := w.Run(ctx); err != nil && err != context.Canceled {
		slog.Error("watcher exited with error", "error", err)
		os.Exit(1)
	}

	slog.Info("farmops-agent stopped")
}
