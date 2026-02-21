// Package config loads and validates the Farm Agent configuration.
package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config holds all agent configuration.
type Config struct {
	// AgentID is the stable UUID identifying this agent instance.
	// Generated on first boot and persisted; do not change after enrollment.
	AgentID string `yaml:"agent_id"`

	// ClusterAlias is a user-chosen label for this cluster (e.g. "prod-eu-1").
	// This is the ONLY cluster identifier that appears in proofs — no real hostnames.
	ClusterAlias string `yaml:"cluster_alias"`

	// TrackerURL is the base URL of the Stats Tracker (e.g. "https://my-tracker.local:8443").
	TrackerURL string `yaml:"tracker_url"`

	// APIKey is the shared secret used to authenticate with the Stats Tracker.
	// Set via FARMOPS_API_KEY env var or directly in config (not recommended).
	APIKey string `yaml:"api_key"`

	// PrivateKeyHex is the hex-encoded Ed25519 private key used to sign proofs.
	// Set via FARMOPS_PRIVATE_KEY env var or directly in config (not recommended).
	PrivateKeyHex string `yaml:"private_key"`

	// Kubeconfig is the path to the kubeconfig file.
	// Leave empty to use in-cluster config (default when running inside k8s).
	Kubeconfig string `yaml:"kubeconfig"`

	// Plugins lists the plugin binaries or sidecar addresses to load.
	Plugins []PluginConfig `yaml:"plugins"`

	// ProofBufferPath is the path to the local BoltDB proof buffer.
	// Proofs are buffered here if the tracker is temporarily unreachable.
	ProofBufferPath string `yaml:"proof_buffer_path"`
}

// PluginConfig describes a single plugin to load.
type PluginConfig struct {
	// ID is the plugin identifier, e.g. "farmops/k8s-pod-health".
	ID string `yaml:"id"`

	// Address is the gRPC address of the plugin process (e.g. "unix:///tmp/plugin.sock").
	Address string `yaml:"address"`
}

// Load reads and validates the agent config from a YAML file.
// Environment variables override file values for sensitive fields.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("config: read %s: %w", path, err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("config: parse %s: %w", path, err)
	}

	// Environment variable overrides for sensitive fields.
	if v := os.Getenv("FARMOPS_API_KEY"); v != "" {
		cfg.APIKey = v
	}
	if v := os.Getenv("FARMOPS_PRIVATE_KEY"); v != "" {
		cfg.PrivateKeyHex = v
	}
	if v := os.Getenv("FARMOPS_TRACKER_URL"); v != "" {
		cfg.TrackerURL = v
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func (c *Config) validate() error {
	if c.AgentID == "" {
		return fmt.Errorf("config: agent_id is required")
	}
	if c.ClusterAlias == "" {
		return fmt.Errorf("config: cluster_alias is required")
	}
	if c.TrackerURL == "" {
		return fmt.Errorf("config: tracker_url is required (or set FARMOPS_TRACKER_URL)")
	}
	if c.APIKey == "" {
		return fmt.Errorf("config: api_key is required (or set FARMOPS_API_KEY)")
	}
	if c.PrivateKeyHex == "" {
		return fmt.Errorf("config: private_key is required (or set FARMOPS_PRIVATE_KEY)")
	}
	if c.ProofBufferPath == "" {
		c.ProofBufferPath = "/var/lib/farmops-agent/proofs.db"
	}
	return nil
}
