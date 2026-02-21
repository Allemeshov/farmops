// Package transport provides client and server helpers for agent↔tracker
// communication. Phase 0 uses a simple HTTP/JSON transport. gRPC will be
// added in Phase 1 once proto generation is wired into the build.
package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/farmops/farmops/pkg/proof"
)

// SubmitResponse is the tracker's response to a proof submission.
type SubmitResponse struct {
	Accepted        bool   `json:"accepted"`
	RejectionReason string `json:"rejection_reason,omitempty"`
	CoinsAwarded    int    `json:"coins_awarded"`
}

// TrackerClient submits proofs to a Stats Tracker over HTTP.
type TrackerClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewTrackerClient creates a new client targeting the given tracker base URL.
// apiKey is the shared secret used to authenticate the agent.
func NewTrackerClient(baseURL, apiKey string) *TrackerClient {
	return &TrackerClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// SubmitProof sends a FarmProof to the Stats Tracker.
func (c *TrackerClient) SubmitProof(ctx context.Context, p *proof.FarmProof) (*SubmitResponse, error) {
	body, err := json.Marshal(p)
	if err != nil {
		return nil, fmt.Errorf("transport: marshal proof: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/v1/proofs", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("transport: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("transport: submit proof: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("transport: tracker returned %d", resp.StatusCode)
	}

	var result SubmitResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("transport: decode response: %w", err)
	}
	return &result, nil
}
