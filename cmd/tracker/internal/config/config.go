// Package config loads and validates the Stats Tracker configuration.
package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config holds all tracker configuration.
type Config struct {
	// ListenAddr is the address the HTTP server binds to (e.g. ":8443").
	ListenAddr string `yaml:"listen_addr"`

	// DBPath is the path to the BoltDB database file.
	DBPath string `yaml:"db_path"`

	// APIKey is the shared secret agents must present to submit proofs.
	// Set via FARMOPS_API_KEY env var or directly in config.
	APIKey string `yaml:"api_key"`
}

// Load reads and validates the tracker config from a YAML file.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("config: read %s: %w", path, err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("config: parse %s: %w", path, err)
	}

	if v := os.Getenv("FARMOPS_API_KEY"); v != "" {
		cfg.APIKey = v
	}
	if v := os.Getenv("FARMOPS_LISTEN_ADDR"); v != "" {
		cfg.ListenAddr = v
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func (c *Config) validate() error {
	if c.ListenAddr == "" {
		c.ListenAddr = ":8443"
	}
	if c.DBPath == "" {
		c.DBPath = "/var/lib/farmops-tracker/tracker.db"
	}
	if c.APIKey == "" {
		return fmt.Errorf("config: api_key is required (or set FARMOPS_API_KEY)")
	}
	return nil
}
