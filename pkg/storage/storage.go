// Package storage defines the storage interface used by the Stats Tracker.
// Phase 0 ships a BoltDB (bbolt) implementation for zero-dependency local use.
// A PostgreSQL implementation is planned for Phase 1.
package storage

import (
	"context"
	"io"
	"time"

	"github.com/farmops/farmops/pkg/proof"
)

// Store is the primary storage interface for the Stats Tracker.
// All methods are context-aware for timeout and cancellation support.
type Store interface {
	ProofStore
	AgentStore
	FarmStore
	io.Closer
}

// ProofStore manages the append-only proof chain.
type ProofStore interface {
	// AppendProof appends a verified proof to the chain.
	// Returns ErrDuplicateProof if proof_id already exists.
	AppendProof(ctx context.Context, p *proof.FarmProof, coinsAwarded int) error

	// GetProof retrieves a single proof by ID.
	GetProof(ctx context.Context, proofID string) (*StoredProof, error)

	// ListProofs returns proofs for a given agent, ordered oldest-first.
	// Use cursor-based pagination via afterProofID.
	ListProofs(ctx context.Context, agentID string, afterProofID string, limit int) ([]*StoredProof, error)

	// LatestProof returns the most recent proof for a given agent.
	// Returns nil, nil if no proofs exist yet (genesis state).
	LatestProof(ctx context.Context, agentID string) (*StoredProof, error)
}

// AgentStore manages the agent trust registry.
type AgentStore interface {
	// UpsertAgent creates or updates an agent record.
	UpsertAgent(ctx context.Context, agent *AgentRecord) error

	// GetAgent retrieves an agent by ID.
	GetAgent(ctx context.Context, agentID string) (*AgentRecord, error)

	// ListAgents returns all registered agents.
	ListAgents(ctx context.Context) ([]*AgentRecord, error)
}

// FarmStore manages the farm state (materialized projection from proof chain).
type FarmStore interface {
	// GetFarm returns the current farm state. Creates a default farm if none exists.
	GetFarm(ctx context.Context) (*FarmState, error)

	// UpdateFarm updates the farm state.
	UpdateFarm(ctx context.Context, farm *FarmState) error
}

// StoredProof is a FarmProof with additional tracker-side metadata.
type StoredProof struct {
	*proof.FarmProof
	CoinsAwarded int
	ReceivedAt   time.Time
}

// AgentRecord represents a registered agent in the trust store.
type AgentRecord struct {
	AgentID      string
	ClusterAlias string
	PublicKey    string // hex-encoded Ed25519 public key
	Status       AgentStatus
	EnrolledAt   time.Time
	RevokedAt    *time.Time
}

// AgentStatus represents the trust state of an agent.
type AgentStatus string

const (
	AgentStatusPending AgentStatus = "pending" // awaiting user approval
	AgentStatusActive  AgentStatus = "active"  // approved and trusted
	AgentStatusRevoked AgentStatus = "revoked" // no longer trusted
)

// FarmState is the materialized farm projection.
type FarmState struct {
	Name         string
	TotalCoins   int
	CurrentCoins int // total minus spent
	StreakDays   int
	LastActiveAt *time.Time
	UpdatedAt    time.Time
}

// Sentinel errors.
var (
	ErrNotFound       = storageError("not found")
	ErrDuplicateProof = storageError("duplicate proof")
)

type storageError string

func (e storageError) Error() string { return string(e) }
