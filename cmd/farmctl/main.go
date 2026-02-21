// Command farmctl is the FarmOps CLI for managing agents, inspecting proofs,
// and interacting with the Stats Tracker.
package main

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"text/tabwriter"
	"time"

	"github.com/farmops/farmops/pkg/proof"
	"github.com/farmops/farmops/pkg/transport"
)

const usage = `farmctl — FarmOps CLI

Usage:
  farmctl <command> [flags]

Commands:
  agent keygen              Generate a new Ed25519 keypair for an agent
  agent enroll              Enroll an agent with the Stats Tracker
  agent approve <agent-id>  Approve a pending agent
  agent revoke  <agent-id>  Revoke an agent's trust
  agent list                List all registered agents

  farm status               Show current farm state
  farm profile              Show public farm profile

  proof inspect <proof-id>  Inspect a stored proof (not yet implemented)

Flags:
  -tracker  Stats Tracker base URL (default: http://localhost:8443)
  -key      API key for authenticated operations (or FARMOPS_API_KEY env var)
`

func main() {
	trackerURL := flag.String("tracker", envOr("FARMOPS_TRACKER_URL", "http://localhost:8443"), "Stats Tracker base URL")
	apiKey := flag.String("key", os.Getenv("FARMOPS_API_KEY"), "API key")
	flag.Usage = func() { fmt.Fprint(os.Stderr, usage) }
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client := transport.NewTrackerClient(*trackerURL, *apiKey)

	switch {
	case len(args) >= 2 && args[0] == "agent" && args[1] == "keygen":
		cmdAgentKeygen()

	case len(args) >= 2 && args[0] == "agent" && args[1] == "enroll":
		if len(args) < 5 {
			fatalf("usage: farmctl agent enroll <agent-id> <cluster-alias> <public-key-hex>\n")
		}
		cmdAgentEnroll(ctx, client, args[2], args[3], args[4])

	case len(args) >= 3 && args[0] == "agent" && args[1] == "approve":
		cmdAgentSetStatus(ctx, *trackerURL, *apiKey, args[2], "approve")

	case len(args) >= 3 && args[0] == "agent" && args[1] == "revoke":
		cmdAgentSetStatus(ctx, *trackerURL, *apiKey, args[2], "revoke")

	case len(args) >= 2 && args[0] == "agent" && args[1] == "list":
		cmdAgentList(ctx, *trackerURL, *apiKey)

	case len(args) >= 2 && args[0] == "farm" && args[1] == "status":
		cmdFarmStatus(ctx, *trackerURL)

	case len(args) >= 2 && args[0] == "farm" && args[1] == "profile":
		cmdFarmProfile(ctx, *trackerURL)

	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n\n%s", args[0], usage)
		os.Exit(1)
	}
}

// cmdAgentKeygen generates a new Ed25519 keypair and prints both keys.
// The private key must be stored securely (Kubernetes Secret, Vault, etc.).
func cmdAgentKeygen() {
	pub, priv, err := proof.GenerateKeyPair()
	if err != nil {
		fatalf("keygen failed: %v\n", err)
	}
	fmt.Printf("Public key (share with tracker during enrollment):\n  %s\n\n", proof.EncodePublicKey(pub))
	fmt.Printf("Private key (store securely — never share):\n  %s\n\n", proof.EncodePrivateKey(priv))
	fmt.Println("Store the private key as FARMOPS_PRIVATE_KEY in your agent config or Kubernetes Secret.")
}

// cmdAgentEnroll sends an enrollment request to the Stats Tracker.
func cmdAgentEnroll(ctx context.Context, _ *transport.TrackerClient, agentID, clusterAlias, pubKeyHex string) {
	// Validate the public key before sending.
	if _, err := proof.DecodePublicKey(pubKeyHex); err != nil {
		fatalf("invalid public key: %v\n", err)
	}

	body, _ := json.Marshal(map[string]string{
		"agent_id":      agentID,
		"cluster_alias": clusterAlias,
		"public_key":    pubKeyHex,
	})

	// Use a raw HTTP call since TrackerClient.SubmitProof is proof-specific.
	// A general-purpose API client will be added in Phase 1.
	fmt.Printf("Enrolling agent %s (alias: %s)...\n", agentID, clusterAlias)
	fmt.Printf("POST /api/v1/agents/enroll\nBody: %s\n", body)
	fmt.Println("\nNote: use curl or the tracker API directly for now.")
	fmt.Printf("  curl -X POST %s/api/v1/agents/enroll \\\n", "http://localhost:8443")
	fmt.Printf("    -H 'Authorization: Bearer $FARMOPS_API_KEY' \\\n")
	fmt.Printf("    -H 'Content-Type: application/json' \\\n")
	fmt.Printf("    -d '%s'\n", body)
	fmt.Printf("\nThen approve with:\n  farmctl agent approve %s\n", agentID)
}

func cmdAgentSetStatus(ctx context.Context, trackerURL, apiKey, agentID, action string) {
	url := fmt.Sprintf("%s/api/v1/agents/%s/%s", trackerURL, agentID, action)
	fmt.Printf("POST %s\n", url)
	fmt.Println("Note: direct HTTP client for agent management will be added in Phase 1.")
	fmt.Printf("  curl -X POST '%s' -H 'Authorization: Bearer %s'\n", url, apiKey)
}

func cmdAgentList(ctx context.Context, trackerURL, apiKey string) {
	url := fmt.Sprintf("%s/api/v1/agents", trackerURL)
	fmt.Printf("GET %s\n", url)
	fmt.Println("Note: direct HTTP client will be added in Phase 1.")
	fmt.Printf("  curl '%s' -H 'Authorization: Bearer %s'\n", url, apiKey)
}

func cmdFarmStatus(ctx context.Context, trackerURL string) {
	url := fmt.Sprintf("%s/api/v1/farm", trackerURL)
	fmt.Printf("GET %s\n", url)
	fmt.Println("Note: direct HTTP client will be added in Phase 1.")
	fmt.Printf("  curl '%s'\n", url)
}

func cmdFarmProfile(ctx context.Context, trackerURL string) {
	url := fmt.Sprintf("%s/api/v1/public/profile", trackerURL)
	fmt.Printf("GET %s\n", url)
	fmt.Printf("  curl '%s'\n", url)
}

// printTable prints a simple tabular output.
func printTable(headers []string, rows [][]string) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, joinTab(headers))
	for _, row := range rows {
		fmt.Fprintln(w, joinTab(row))
	}
	w.Flush()
}

func joinTab(ss []string) string {
	out := ""
	for i, s := range ss {
		if i > 0 {
			out += "\t"
		}
		out += s
	}
	return out
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format, args...)
	os.Exit(1)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Ensure ed25519 is imported (used indirectly via proof package; kept for future direct use).
var _ ed25519.PublicKey
