// Command farmops-tracker is the Stats Tracker binary.
// It validates incoming FarmProof records, maintains the proof chain,
// computes coin rewards, and manages the user's farm state.
package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/farmops/farmops/cmd/tracker/internal/api"
	"github.com/farmops/farmops/cmd/tracker/internal/config"
	"github.com/farmops/farmops/pkg/scoring"
	"github.com/farmops/farmops/pkg/storage"
)

func main() {
	cfgPath := flag.String("config", "tracker.yaml", "path to tracker config file")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	store, err := storage.OpenBolt(cfg.DBPath)
	if err != nil {
		slog.Error("failed to open storage", "error", err, "path", cfg.DBPath)
		os.Exit(1)
	}
	defer store.Close()

	scoringCfg := scoring.DefaultConfig()

	handler := api.NewHandler(store, scoringCfg, cfg.APIKey, logger)

	srv := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	go func() {
		slog.Info("farmops-tracker listening", "addr", cfg.ListenAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			cancel()
		}
	}()

	<-ctx.Done()
	slog.Info("farmops-tracker shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}

	slog.Info("farmops-tracker stopped")
}
