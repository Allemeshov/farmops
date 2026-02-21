// Package api implements the Stats Tracker HTTP API.
// Phase 0 covers proof ingestion, chain validation, and basic farm state queries.
package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/farmops/farmops/pkg/proof"
	"github.com/farmops/farmops/pkg/scoring"
	"github.com/farmops/farmops/pkg/storage"
)

// Handler is the root HTTP handler for the Stats Tracker API.
type Handler struct {
	store      storage.Store
	scoringCfg scoring.Config
	apiKey     string
	log        *slog.Logger
	mux        *http.ServeMux
}

// NewHandler creates a new Handler and registers all routes.
func NewHandler(store storage.Store, scoringCfg scoring.Config, apiKey string, log *slog.Logger) http.Handler {
	h := &Handler{
		store:      store,
		scoringCfg: scoringCfg,
		apiKey:     apiKey,
		log:        log,
		mux:        http.NewServeMux(),
	}
	h.routes()
	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

func (h *Handler) routes() {
	// Health
	h.mux.HandleFunc("GET /healthz", h.handleHealthz)
	h.mux.HandleFunc("GET /readyz", h.handleReadyz)

	// Proof ingestion (agent → tracker, requires API key)
	h.mux.HandleFunc("POST /api/v1/proofs", h.requireAPIKey(h.handleSubmitProof))

	// Farm state (public read)
	h.mux.HandleFunc("GET /api/v1/farm", h.handleGetFarm)

	// Agent management
	h.mux.HandleFunc("GET /api/v1/agents", h.handleListAgents)
	h.mux.HandleFunc("POST /api/v1/agents/enroll", h.requireAPIKey(h.handleEnrollAgent))
	h.mux.HandleFunc("POST /api/v1/agents/{id}/approve", h.requireAPIKey(h.handleApproveAgent))
	h.mux.HandleFunc("POST /api/v1/agents/{id}/revoke", h.requireAPIKey(h.handleRevokeAgent))

	// Public profile (for village servers)
	h.mux.HandleFunc("GET /api/v1/public/profile", h.handlePublicProfile)
}

// --- Middleware ---

func (h *Handler) requireAPIKey(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		token := strings.TrimPrefix(auth, "Bearer ")
		if token != h.apiKey {
			h.writeError(w, http.StatusUnauthorized, "invalid or missing API key")
			return
		}
		next(w, r)
	}
}

// --- Health ---

func (h *Handler) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	h.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleReadyz(w http.ResponseWriter, r *http.Request) {
	if _, err := h.store.GetFarm(r.Context()); err != nil {
		h.writeError(w, http.StatusServiceUnavailable, "storage unavailable")
		return
	}
	h.writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

// --- Proof ingestion ---

func (h *Handler) handleSubmitProof(w http.ResponseWriter, r *http.Request) {
	var p proof.FarmProof
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid proof JSON")
		return
	}

	// Look up the agent's public key from the trust store.
	agent, err := h.store.GetAgent(r.Context(), p.Agent.AgentID)
	if err == storage.ErrNotFound {
		h.writeError(w, http.StatusForbidden, "unknown agent — enroll first")
		return
	}
	if err != nil {
		h.log.Error("get agent", "error", err)
		h.writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	if agent.Status != storage.AgentStatusActive {
		h.writeError(w, http.StatusForbidden, "agent not approved (status: "+string(agent.Status)+")")
		return
	}

	// Verify the proof signature.
	pubKey, err := proof.DecodePublicKey(agent.PublicKey)
	if err != nil {
		h.log.Error("decode agent public key", "agent_id", agent.AgentID, "error", err)
		h.writeError(w, http.StatusInternalServerError, "invalid agent key in trust store")
		return
	}
	if err := proof.Verify(&p, pubKey); err != nil {
		h.writeError(w, http.StatusUnprocessableEntity, "proof signature invalid: "+err.Error())
		return
	}

	// Verify chain linkage against the latest stored proof for this agent.
	latest, err := h.store.LatestProof(r.Context(), p.Agent.AgentID)
	if err != nil {
		h.log.Error("get latest proof", "error", err)
		h.writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	if latest != nil {
		prevHash, err := latest.FarmProof.Hash()
		if err != nil {
			h.log.Error("hash latest proof", "error", err)
			h.writeError(w, http.StatusInternalServerError, "chain hash error")
			return
		}
		if p.PrevProofID != latest.ProofID || p.PrevProofHash != prevHash {
			h.writeError(w, http.StatusConflict, "proof chain linkage invalid")
			return
		}
	}

	// Only score verified, successful proofs.
	coins := 0
	if p.Outcome.Verified && p.Outcome.Status == proof.OutcomeSuccess {
		farm, err := h.store.GetFarm(r.Context())
		if err != nil {
			h.log.Error("get farm for scoring", "error", err)
		}
		_ = farm // upgrade multiplier lookup will be added in Phase 1
		result := scoring.Compute(&p, h.scoringCfg, 1.0, 0)
		coins = result.TotalCoins
	}

	if err := h.store.AppendProof(r.Context(), &p, coins); err == storage.ErrDuplicateProof {
		h.writeJSON(w, http.StatusOK, map[string]any{
			"accepted":         false,
			"rejection_reason": "duplicate proof_id",
			"coins_awarded":    0,
		})
		return
	} else if err != nil {
		h.log.Error("append proof", "error", err)
		h.writeError(w, http.StatusInternalServerError, "storage error")
		return
	}

	// Update farm coin balance.
	if coins > 0 {
		farm, _ := h.store.GetFarm(r.Context())
		if farm != nil {
			farm.TotalCoins += coins
			farm.CurrentCoins += coins
			_ = h.store.UpdateFarm(r.Context(), farm)
		}
	}

	h.log.Info("proof accepted", "proof_id", p.ProofID, "agent_id", p.Agent.AgentID, "coins", coins)
	h.writeJSON(w, http.StatusCreated, map[string]any{
		"accepted":      true,
		"coins_awarded": coins,
	})
}

// --- Farm ---

func (h *Handler) handleGetFarm(w http.ResponseWriter, r *http.Request) {
	farm, err := h.store.GetFarm(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	h.writeJSON(w, http.StatusOK, farm)
}

// --- Agents ---

type enrollRequest struct {
	AgentID      string `json:"agent_id"`
	ClusterAlias string `json:"cluster_alias"`
	PublicKey    string `json:"public_key"` // hex-encoded Ed25519 public key
}

func (h *Handler) handleEnrollAgent(w http.ResponseWriter, r *http.Request) {
	var req enrollRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.AgentID == "" || req.PublicKey == "" || req.ClusterAlias == "" {
		h.writeError(w, http.StatusBadRequest, "agent_id, cluster_alias, and public_key are required")
		return
	}
	// Validate the public key is parseable.
	if _, err := proof.DecodePublicKey(req.PublicKey); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid public_key: "+err.Error())
		return
	}

	record := &storage.AgentRecord{
		AgentID:      req.AgentID,
		ClusterAlias: req.ClusterAlias,
		PublicKey:    req.PublicKey,
		Status:       storage.AgentStatusPending,
	}
	if err := h.store.UpsertAgent(r.Context(), record); err != nil {
		h.log.Error("enroll agent", "error", err)
		h.writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	h.log.Info("agent enrolled (pending approval)", "agent_id", req.AgentID, "alias", req.ClusterAlias)
	h.writeJSON(w, http.StatusCreated, map[string]string{
		"status":  "pending",
		"message": "Agent enrolled. Approve it with: farmctl agent approve " + req.AgentID,
	})
}

func (h *Handler) handleApproveAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	h.setAgentStatus(w, r, id, storage.AgentStatusActive)
}

func (h *Handler) handleRevokeAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	h.setAgentStatus(w, r, id, storage.AgentStatusRevoked)
}

func (h *Handler) setAgentStatus(w http.ResponseWriter, r *http.Request, agentID string, status storage.AgentStatus) {
	agent, err := h.store.GetAgent(r.Context(), agentID)
	if err == storage.ErrNotFound {
		h.writeError(w, http.StatusNotFound, "agent not found")
		return
	}
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	agent.Status = status
	if err := h.store.UpsertAgent(r.Context(), agent); err != nil {
		h.writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	h.log.Info("agent status updated", "agent_id", agentID, "status", status)
	h.writeJSON(w, http.StatusOK, map[string]string{"status": string(status)})
}

func (h *Handler) handleListAgents(w http.ResponseWriter, r *http.Request) {
	agents, err := h.store.ListAgents(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	h.writeJSON(w, http.StatusOK, agents)
}

// --- Public profile ---

func (h *Handler) handlePublicProfile(w http.ResponseWriter, r *http.Request) {
	farm, err := h.store.GetFarm(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "storage error")
		return
	}
	// Public profile exposes only aggregate stats — no proof details.
	h.writeJSON(w, http.StatusOK, map[string]any{
		"farm_name":     farm.Name,
		"total_coins":   farm.TotalCoins,
		"current_coins": farm.CurrentCoins,
		"streak_days":   farm.StreakDays,
	})
}

// --- Helpers ---

func (h *Handler) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (h *Handler) writeError(w http.ResponseWriter, status int, msg string) {
	h.writeJSON(w, status, map[string]string{"error": msg})
}
