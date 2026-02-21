// Package proof defines the FarmProof schema and canonical JSON representation.
// A FarmProof is the fundamental unit of verified work that crosses the
// agent→tracker boundary. It contains NO sensitive data — only hashed evidence,
// category metadata, and scoring hints.
package proof

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Version is the current FarmProof schema version.
const Version = "1"

// Action types.
const (
	ActionVerify    = "verify"
	ActionFix       = "fix"
	ActionUpgrade   = "upgrade"
	ActionDeploy    = "deploy"
	ActionResolve   = "resolve"
	ActionReview    = "review"
	ActionConfigure = "configure"
	ActionObserve   = "observe"
)

// Categories.
const (
	CategoryMaintenance = "maintenance"
	CategoryToil        = "toil"
	CategoryReliability = "reliability"
	CategorySecurity    = "security"
	CategoryIncident    = "incident"
	CategoryUpgrade     = "upgrade"
)

// Complexity levels.
const (
	ComplexityLow    = "low"
	ComplexityMedium = "medium"
	ComplexityHigh   = "high"
)

// Outcome statuses.
const (
	OutcomeSuccess = "success"
	OutcomeFailure = "failure"
	OutcomePartial = "partial"
)

// Actor types.
const (
	ActorHuman  = "human"
	ActorBot    = "bot"
	ActorSystem = "system"
)

// FarmProof is the canonical proof record transmitted from agent to tracker.
// All fields are safe to transmit — no sensitive infrastructure data is included.
type FarmProof struct {
	SchemaVersion string `json:"schema_version"`

	ProofID       string `json:"proof_id"`
	PrevProofID   string `json:"prev_proof_id,omitempty"`
	PrevProofHash string `json:"prev_proof_hash,omitempty"`

	Timestamp time.Time `json:"timestamp"`

	Agent        AgentInfo    `json:"agent"`
	Actor        ActorInfo    `json:"actor"`
	Action       ActionInfo   `json:"action"`
	Outcome      OutcomeInfo  `json:"outcome"`
	ScoringHints ScoringHints `json:"scoring_hints"`

	// Signature is the Ed25519 signature over the canonical JSON of all fields
	// above (with Signature itself set to empty string before signing).
	Signature string `json:"signature"`
}

// AgentInfo identifies the agent that produced the proof.
type AgentInfo struct {
	AgentID      string `json:"agent_id"`
	ClusterAlias string `json:"cluster_alias"` // user-chosen label, NOT a real hostname
}

// ActorInfo identifies who performed the action, without revealing their identity.
type ActorInfo struct {
	ActorHash string `json:"actor_hash"` // sha256(canonical-user-identifier)
	ActorType string `json:"actor_type"` // human | bot | system
}

// ActionInfo describes what happened, without sensitive details.
type ActionInfo struct {
	Plugin      string `json:"plugin"`
	ActionType  string `json:"action_type"`
	Category    string `json:"category"`
	Subcategory string `json:"subcategory,omitempty"`
	Description string `json:"description"` // non-sensitive human-readable summary
}

// OutcomeInfo describes the result of the action.
type OutcomeInfo struct {
	Status       string `json:"status"` // success | failure | partial
	Verified     bool   `json:"verified"`
	EvidenceHash string `json:"evidence_hash"` // sha256 of raw evidence (kept locally by agent)
}

// ScoringHints provides the scoring engine with context for coin calculation.
// All values are derived from plugin logic; none reveal sensitive data.
type ScoringHints struct {
	Complexity       string `json:"complexity"`    // low | medium | high
	ImpactRadius     int    `json:"impact_radius"` // 1–10
	ArtifactsTouched int    `json:"artifacts_touched"`
	TimeSpentSeconds int64  `json:"time_spent_seconds"` // 0 if unknown
}

// New creates a new FarmProof with a generated UUID v7 and current timestamp.
// prev may be nil for the genesis proof.
func New(agent AgentInfo, actor ActorInfo, action ActionInfo, outcome OutcomeInfo, hints ScoringHints, prev *FarmProof) (*FarmProof, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return nil, fmt.Errorf("proof: generate id: %w", err)
	}

	p := &FarmProof{
		SchemaVersion: Version,
		ProofID:       id.String(),
		Timestamp:     time.Now().UTC(),
		Agent:         agent,
		Actor:         actor,
		Action:        action,
		Outcome:       outcome,
		ScoringHints:  hints,
	}

	if prev != nil {
		p.PrevProofID = prev.ProofID
		h, err := prev.Hash()
		if err != nil {
			return nil, fmt.Errorf("proof: hash previous proof: %w", err)
		}
		p.PrevProofHash = h
	}

	return p, nil
}

// CanonicalJSON returns the deterministic JSON encoding of the proof
// with the Signature field set to empty string. This is the payload
// that is signed and verified.
func (p *FarmProof) CanonicalJSON() ([]byte, error) {
	// Shallow copy with empty signature to avoid mutating the original.
	cp := *p
	cp.Signature = ""
	b, err := json.Marshal(cp)
	if err != nil {
		return nil, fmt.Errorf("proof: canonical json: %w", err)
	}
	return b, nil
}

// Hash returns the sha256 hex digest of the proof's canonical JSON.
// This is used as PrevProofHash in the next proof in the chain.
func (p *FarmProof) Hash() (string, error) {
	b, err := p.CanonicalJSON()
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:]), nil
}

// HashEvidence returns the sha256 hex digest of arbitrary raw evidence bytes.
// The agent calls this before creating a proof; the hash goes into EvidenceHash.
// The raw bytes are never transmitted.
func HashEvidence(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

// HashActor returns the sha256 hex digest of a canonical actor identifier
// (e.g. "github:username" or "email:user@example.com").
// The raw identifier is never transmitted.
func HashActor(canonicalID string) string {
	sum := sha256.Sum256([]byte(canonicalID))
	return hex.EncodeToString(sum[:])
}
