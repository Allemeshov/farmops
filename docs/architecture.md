# FarmOps — Architecture Document

> **Version:** 0.2.0-draft
> **Last updated:** 2026-02-21
> **Status:** Pre-implementation design phase

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Core Components](#2-core-components)
3. [Event Model & Canonical Schema](#3-event-model--canonical-schema)
4. [Verification & Trust Model](#4-verification--trust-model)
5. [Plugin Architecture](#5-plugin-architecture)
6. [Scoring Engine](#6-scoring-engine)
7. [Technology Choices & Rationale](#7-technology-choices--rationale)
8. [Data Model & Storage](#8-data-model--storage)
9. [API Design](#9-api-design)
10. [Deployment Models](#10-deployment-models)
11. [Integration Targets — Phase 1](#11-integration-targets--phase-1)
12. [Security, Privacy & Confidentiality](#12-security-privacy--confidentiality)
13. [Development Phases](#13-development-phases)

---

## 1. System Overview

FarmOps is a **decentralized, API-first platform** that gamifies DevOps and SRE work. It transforms routine infrastructure maintenance — pod health checks, certificate rotations, Terraform drift fixes, incident resolutions — into verifiable achievements that earn coins for a personal virtual farm.

The system is composed of three autonomous components that communicate through signed, append-only event proofs:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER'S K8S CLUSTER                           │
│                                                                     │
│  ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌───────────┐        │
│  │ k3s/k8s   │  │ Terraform │  │ Prometheus │  │ Gitea /   │  ...   │
│  │ API Server│  │ State     │  │ Alertmgr   │  │ GitHub    │        │
│  └─────┬─────┘  └─────┬─────┘  └─────┬──────┘  └─────┬─────┘        │
│        │              │              │               │              │
│        └──────────────┴──────────────┴───────────────┘              │
│                              │                                      │
│                     ┌────────▼────────┐                             │
│                     │   FARM AGENT    │                             │
│                     │  (in-cluster)   │                             │
│                     │                 │                             │
│                     │ • Observe only  │                             │
│                     │ • Verify actions│                             │
│                     │ • Sign proofs   │                             │
│                     │ • Plugin runtime│                             │
│                     └────────┬────────┘                             │
│                              │                                      │
└──────────────────────────────┼──────────────────────────────────────┘
                               │  Signed Event Proofs
                               │  (no raw data leaves cluster)
                               ▼
                 ┌───────────────────────────┐
                 │      STATS TRACKER        │
                 │  (personal laptop / VPS)  │
                 │                           │
                 │ • Coin balance & history  │
                 │ • Farm state (upgrades)   │
                 │ • Proof chain validation  │
                 │ • NO work-related data    │
                 │ • Personal API server     │
                 └────────────┬──────────────┘
                              │  Public farm stats only
                              │  (no event details)
                              ▼
                ┌───────────────────────────┐
                │     VILLAGE SERVER(S)     │
                │                           │
                │ • Social layer            │
                │ • Leaderboards            │
                │ • Farm showcases          │
                │ • Federation with other   │
                │   village servers         │
                │ • Matchmaking / arenas    │
                └───────────────────────────┘
```

### Design Principles

1. **Confidentiality by design** — Raw events, logs, and infrastructure details never leave the cluster. Only cryptographically signed, content-stripped proofs cross the boundary.
2. **API-first** — Every component exposes a well-defined API. There is no canonical UI; the community decides how to visualize farms (SPA, Unity, Grafana, VS Code, TUI).
3. **Plugin-driven workflow** — FarmOps does not hardcode what constitutes "good work." Plugins define observation rules, verification logic, and scoring hints. Users and organizations author plugins for their own stacks.
4. **Decentralized ownership** — No central authority. Your farm is yours. You connect it to whichever village servers you choose, just like connecting a game save to multiple multiplayer servers.
5. **Tamper-resistant scoring** — A hash-chained proof log ensures that scores cannot be fabricated or inflated without detection.

---

## 2. Core Components

### 2.1 Farm Agent

**Purpose:** Observe infrastructure activity, verify that meaningful work occurred, produce signed event proofs.

**Deployment:** Runs inside the user's Kubernetes cluster as a Deployment (or DaemonSet for node-level observation). Can also run as a standalone binary for non-k8s environments.

**Key constraints:**
- **Read-only access** to cluster resources (RBAC: `get`, `list`, `watch` only)
- **No execute/write** permissions on any workload or infrastructure resource
- May write only to its own namespace (proof buffer, plugin state)
- Produces **proof records**, not raw data — the proof contains a hash of the evidence, a category, a score hint, and the agent's signature, but not the evidence itself

**Responsibilities:**
- Run the plugin runtime (load and execute observation/verification plugins)
- Watch Kubernetes API server events, parse Terraform state diffs, poll Prometheus/Alertmanager, listen to Git webhooks
- When a plugin identifies a verified action, produce a `FarmProof` and transmit it to the user's Stats Tracker
- Maintain a local append-only proof log as a buffer (in case Stats Tracker is temporarily unreachable). Consider using Raft consensus to ensure proof integrity.

**Plugin interface (see Section 5):**
- Plugins register event sources and verification rules
- The agent provides a sandboxed runtime (gRPC sidecar or WASM) for plugin execution
- Plugins receive structured observations and return verification verdicts

### 2.2 Stats Tracker

**Purpose:** Personal scoring server. Owns the user's farm state, validates incoming proofs, maintains the canonical coin ledger.

**Deployment:** Runs on the user's personal machine, a VPS, or as a lightweight container. Docker Compose or standalone binary.

**Key constraints:**
- Stores **only farm-related data**: coins, upgrades, purchase history, proof chain, achievements
- Stores **no work content**: no pod names, no Terraform resources, no alert bodies, no PR diffs, no incident details
- The proof chain is the single source of truth for scoring — if a proof is invalid or breaks the chain, it is rejected

**Responsibilities:**
- Receive and validate `FarmProof` records from one or more agents
- Verify proof signatures against registered agent public keys
- Verify hash chain integrity (each proof references the previous proof's hash)
- Apply scoring rules to compute coin rewards
- Maintain farm state: buildings, upgrades, cosmetics, progression
- Expose a **Personal API** for:
  - Farm state queries (public, for village servers)
  - Proof submission (from agents, authenticated)
  - Farm management (upgrades, purchases — local only or authenticated)
- Optionally publish public farm stats to connected village servers

### 2.3 Village Server

**Purpose:** Social multiplayer layer. Aggregates and displays farms from connected Stats Trackers.

**Deployment:** Any server accessible to participants. Docker Compose, Kubernetes, or standalone binary.

**Design model: Federation** (inspired by Matrix/ActivityPub, not centralized matchmaking)

**How it works:**
- A Village Server maintains a **roster** of registered farmers (Stats Tracker endpoints)
- Periodically (or via push) syncs public farm state from each farmer's Stats Tracker
- Provides social features: leaderboards, farm showcases, seasonal challenges, guild/team groupings
- A single Stats Tracker can connect to **multiple** Village Servers simultaneously (friends server + company server + global competitive server)
- Village Servers can **federate** with each other: share leaderboards, run cross-village tournaments, discover new farmers
- Village Servers **never** see raw event data — only aggregated farm stats (coins earned this week, upgrade levels, achievement badges)

**Why federation?**
- A group of 3 friends runs a tiny Village Server on a Raspberry Pi
- A company of 100 DevOps engineers runs a Village Server on their internal network
- A community runs a public competitive Village Server
- The same farmer participates in all three with the same farm — no data duplication, no central authority

---

## 3. Event Model & Canonical Schema

FarmOps uses an **event-sourced** architecture. The append-only proof log is the source of truth. Current state (coin balance, farm upgrades) is a materialized projection that can always be recomputed from the proof chain.

### 3.1 Why Event Sourcing

| Concern | CRUD | Event Sourcing |
|---|---|---|
| Audit trail | Lost on update | Complete by design |
| Replay & rebuild | Impossible | Replay from log |
| Tamper detection | Difficult | Hash chain makes tampering evident |
| Confidentiality split | Hard to separate what happened from current state | Natural: proofs (events) stay in agent, projections (state) live in Stats Tracker |
| Time-travel queries | Requires versioning hacks | Native (replay to any point) |

Event sourcing aligns perfectly with the decentralized trust model: the proof chain IS the blockchain-lite ledger.

### 3.2 Canonical Event Schema: `FarmProof`

This is the fundamental data unit that crosses the agent→tracker boundary. It must be minimal (no confidential data) yet sufficient for scoring.

```
FarmProof v1
─────────────────────────────────────────────────────
{
  "schema_version": "1",
  "proof_id":       "uuid-v7",
  "prev_proof_id":  "uuid-v7 | null (genesis)",
  "prev_proof_hash":"sha256 hex | null (genesis)",
  "timestamp":      "2026-02-21T09:30:00Z",

  "agent": {
    "agent_id":     "uuid of the agent instance",
    "cluster_alias":"user-chosen alias, e.g. 'prod-eu-1' (no real hostnames)"
  },

  "actor": {
    "actor_hash":   "sha256(canonical-user-identifier)",
    "actor_type":   "human | bot | system"
  },

  "action": {
    "plugin":       "farmops/k8s-pod-health",
    "action_type":  "verify | fix | upgrade | deploy | resolve | review | configure | observe",
    "category":     "maintenance | toil | reliability | security | incident | upgrade",
    "subcategory":  "optional, plugin-defined string",
    "description":  "Verified pod health across all namespaces (52 pods healthy)"
  },

  "outcome": {
    "status":       "success | failure | partial",
    "verified":     true,
    "evidence_hash":"sha256 of raw evidence (kept locally by agent, never transmitted)"
  },

  "scoring_hints": {
    "complexity":    "low | medium | high",
    "impact_radius": 3,
    "artifacts_touched": 52,
    "time_spent_seconds": null
  },

  "signature":      "ed25519 signature of canonical JSON (minus this field) by agent private key"
}
```

### 3.3 Schema Design Decisions

**What IS included:**
- **Action category and type** — needed for scoring (different categories have different base coin rates)
- **Complexity and impact hints** — plugins provide these so the scoring engine can apply multipliers
- **Outcome status** — only verified successful actions earn coins
- **Evidence hash** — proves that evidence existed at the time, without revealing it
- **Hash chain** — each proof references the previous, forming a tamper-evident log
- **Agent signature** — proves the proof was issued by a trusted agent, not fabricated

**What is NOT included (by design):**
- No resource names (pod names, deployment names, node IPs)
- No namespace names, cluster endpoints, or DNS names
- No file contents, diffs, or log snippets
- No PR bodies, issue descriptions, or alert payloads
- No credentials, tokens, or secrets of any kind
- The `cluster_alias` is a user-chosen label (e.g., "work-prod"), not a real hostname

### 3.4 Internal Agent Events (Never Leave Cluster)

Inside the agent, plugins produce richer **Observation** records that include full details. These are used for verification but are stored only in the agent's local buffer (ephemeral or encrypted-at-rest) and are never transmitted:

```
Observation (agent-internal only)
─────────────────────────────────
{
  "observation_id": "uuid-v7",
  "source_type":    "kubernetes | terraform | prometheus | git | ci | custom",
  "source_ref":     "full resource reference (e.g., namespace/deployment/name)",
  "raw_data":       { ... full event payload ... },
  "detected_at":    "timestamp",
  "plugin":         "farmops/k8s-pod-health",
  "verification": {
    "verdict":      "verified | rejected | inconclusive",
    "reason":       "All 52 pods in Running state, 0 CrashLoopBackOff",
    "evidence":     { ... structured evidence ... }
  }
}
```

The agent converts a verified `Observation` into a `FarmProof` by stripping all sensitive fields and hashing the evidence.

---

## 4. Verification & Trust Model

### 4.1 Blockchain-Lite: Hash-Chained Proof Log

Full blockchain consensus (proof-of-work, proof-of-stake) is overkill for FarmOps. We don't need global consensus — we need **tamper evidence** and **provenance**.

The model is closer to **git commits** or **certificate transparency logs**:

```
Proof #0 (genesis)
  proof_id: aaa
  prev_proof_hash: null
  hash: sha256(canonical_json(proof_0)) = H0
  signature: sign(agent_key, H0)

Proof #1
  proof_id: bbb
  prev_proof_hash: H0
  hash: sha256(canonical_json(proof_1)) = H1
  signature: sign(agent_key, H1)

Proof #2
  proof_id: ccc
  prev_proof_hash: H1
  hash: sha256(canonical_json(proof_2)) = H2
  signature: sign(agent_key, H2)
```

**Tamper detection:** If anyone modifies Proof #1, its hash changes, which breaks the chain at Proof #2. The Stats Tracker validates the full chain on every insertion.

**Multi-agent chains:** Each agent maintains its own chain. The Stats Tracker merges multiple agent chains into a unified ledger, verifying each independently.

### 4.2 Agent Identity & Trust

```
Agent Enrollment
────────────────
1. Agent generates Ed25519 keypair on first boot
2. Agent presents its public key + cluster alias to Stats Tracker
3. User explicitly approves the agent (out-of-band confirmation)
4. Stats Tracker stores the agent's public key in its trust store
5. All subsequent proofs from that agent are verified against this key
```

- **Key rotation:** Agent can rotate keys; the old key signs a "key rotation" proof that introduces the new public key
- **Revocation:** User can revoke an agent's trust at any time; all subsequent proofs from that agent are rejected
- **No implicit trust:** An unknown agent's proofs are buffered but not scored until the user approves it

### 4.3 Anti-Cheat Considerations

| Threat | Mitigation |
|---|---|
| Fabricated proofs from fake agent | Proofs must be signed by an enrolled agent key |
| Replay attacks (submitting same proof twice) | `proof_id` uniqueness + hash chain ordering |
| Inflated scoring hints | Plugins are open-source and auditable; community can flag suspicious plugins |
| Compromised agent key | Key revocation + chain invalidation from compromise point |
| Man-in-the-middle on agent→tracker | TLS + proof signatures (even if intercepted, can't forge) |
| Modified proof in transit | Signature verification fails |

For v1, this provides meaningful tamper resistance. Full Byzantine fault tolerance (multi-validator consensus) is a future consideration if competitive FarmOps leagues demand it.

---

## 5. Plugin Architecture

### 5.1 Design Philosophy

FarmOps does not — and cannot — know every possible DevOps workflow. Instead, it provides a **plugin runtime** and a **plugin SDK**, and delegates workflow definition to plugin authors.

```
┌──────────────────────────────────────────────┐
│               FARM AGENT                     │
│                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ k8s-pod │  │terraform│  │ git-pr  │  ...  │
│  │ health  │  │ drift   │  │ review  │       │
│  └────┬────┘  └────┬────┘  └────┬────┘       │
│       │            │            │            │
│  ┌────▼────────────▼────────────▼─────┐      │
│  │        Plugin Runtime (gRPC)       │      │
│  │                                    │      │
│  │  • Plugin discovery & loading      │      │
│  │  • Sandboxed execution             │      │
│  │  • Resource limits (CPU/mem/time)  │      │
│  │  • Observation → Verification flow │      │
│  └────────────────┬───────────────────┘      │
│                   │                          │
│  ┌────────────────▼───────────────────┐      │
│  │         Proof Generator            │      │
│  │  • Strip sensitive data            │      │
│  │  • Hash evidence                   │      │
│  │  • Chain to previous proof         │      │
│  │  • Sign with agent key             │      │
│  └────────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

### 5.2 Plugin Contract (gRPC)

Plugins run **out-of-process** as separate containers (sidecars) or standalone binaries. Communication is via gRPC over a Unix domain socket or localhost.

```protobuf
// farmops/plugin/v1/plugin.proto

service FarmPlugin {
  // Called once when the agent loads the plugin
  rpc Describe(DescribeRequest) returns (DescribeResponse);

  // Called by the agent to deliver raw observations for verification
  rpc Verify(VerifyRequest) returns (VerifyResponse);

  // Optional: plugin can request the agent to set up watchers
  rpc ConfigureSources(ConfigureSourcesRequest) returns (ConfigureSourcesResponse);
}

message DescribeRequest {}

message DescribeResponse {
  string plugin_id = 1;        // e.g. "farmops/k8s-pod-health"
  string version = 2;          // semver
  string description = 3;
  repeated string categories = 4; // which action categories this plugin handles
  repeated SourceRequirement source_requirements = 5;
}

message SourceRequirement {
  string source_type = 1;      // "kubernetes", "terraform", "prometheus", etc.
  repeated string permissions = 2; // what the plugin needs to observe
}

message VerifyRequest {
  string observation_id = 1;
  string source_type = 2;
  bytes raw_data = 3;          // serialized observation payload
  google.protobuf.Timestamp detected_at = 4;
}

message VerifyResponse {
  string verdict = 1;          // "verified", "rejected", "inconclusive"
  string reason = 2;
  string action_type = 3;      // "verify", "fix", "upgrade", etc.
  string category = 4;         // "maintenance", "reliability", etc.
  string subcategory = 5;
  string description = 6;      // human-readable, non-sensitive summary
  ScoringHints scoring_hints = 7;
  bytes evidence = 8;          // structured evidence (hashed, never transmitted)
}

message ScoringHints {
  string complexity = 1;       // "low", "medium", "high"
  int32 impact_radius = 2;
  int32 artifacts_touched = 3;
  int64 time_spent_seconds = 4;
}
```

### 5.3 Plugin Authoring

**Primary language: Go** — native performance, direct access to k8s client libraries, compiles to a single binary.

**Secondary: TypeScript** — via one of two paths:
- **gRPC server in Node.js/Deno/Bun** — simplest, plugin is a small server process
- **WASM** — compile TypeScript to WASM, run in the agent's embedded WASM runtime (Wazero for Go). Better sandboxing, no Node.js dependency. Viable once tooling matures.

**Plugin packaging:**
- A plugin is a container image (OCI) or a standalone binary
- The agent discovers plugins via a `farmops-plugins.yaml` manifest
- Plugins are versioned and can be pulled from any OCI registry

### 5.4 Built-in Plugins (Phase 1)

These are first-party plugins maintained in the FarmOps repository:

| Plugin ID | Source | What it verifies |
|---|---|---|
| `farmops/k8s-pod-health` | Kubernetes API | Periodic pod health checks (Running, no CrashLoopBackOff) |
| `farmops/k8s-resource-audit` | Kubernetes API | Resource requests/limits set, no privileged containers |
| `farmops/k8s-deprecated-api` | Kubernetes API | Detection and fix of deprecated API versions |
| `farmops/terraform-drift` | Terraform state | Drift detection and resolution verification |
| `farmops/terraform-apply` | Terraform state/CI | Successful plan+apply cycles |
| `farmops/ansible-run` | Ansible logs/CI | Successful playbook executions with changed tasks |
| `farmops/git-pr-review` | Gitea/GitHub webhooks | PR review completions, merge verifications |
| `farmops/prometheus-alert-resolve` | Alertmanager API | Alert fired → acknowledged → resolved lifecycle |
| `farmops/ci-pipeline` | GitHub Actions / future Jenkins | Successful CI pipeline completions |
| `farmops/certificate-renewal` | Kubernetes Secrets / cert-manager | Certificate rotation verification |

---

## 6. Scoring Engine

### 6.1 Scoring Formula

```
coins = round(base_coins × complexity_mult × impact_mult × streak_mult × upgrade_mult)
```

| Factor | Source | Description |
|---|---|---|
| `base_coins` | Category config | Each category has a configurable base rate |
| `complexity_mult` | Plugin scoring hints | low=1.0, medium=1.25, high=1.5 |
| `impact_mult` | Plugin scoring hints | Based on `impact_radius` (1-10 → 1.0-2.0) |
| `streak_mult` | Stats Tracker | Consecutive days of activity bonus (1.0 → 1.5 over 7 days) |
| `upgrade_mult` | Farm state | Farm upgrades that boost specific categories |

### 6.2 Base Coin Rates (Defaults, Configurable)

| Category | Base Coins | Rationale |
|---|---|---|
| `maintenance` | 10 | Routine, frequent, lower skill ceiling |
| `toil` | 15 | Automating toil is more impactful |
| `reliability` | 20 | Directly improves system reliability |
| `security` | 25 | Security work is critical and often deferred |
| `incident` | 30 | Incident resolution under pressure |
| `upgrade` | 20 | Infrastructure upgrades reduce tech debt |

### 6.3 Scoring Lives in the Stats Tracker

The scoring engine runs in the Stats Tracker, not the agent. This is deliberate:
- Agents could be compromised; scoring in the tracker is one more layer of defense
- Users can customize their scoring rules (personal difficulty settings)
- Scoring configuration can differ between village servers (competitive leagues with different rules)

---

## 7. Technology Choices & Rationale

### 7.1 Language Selection

| Component | Language | Rationale |
|---|---|---|
| **Farm Agent** | Go | K8s-native (client-go, controller-runtime), single binary deployment, excellent concurrency for watching multiple sources, low memory footprint for in-cluster operation |
| **Stats Tracker** | Go | Consistency with agent, event sourcing engine performance, embedded database options |
| **Village Server** | Go | Consistency, federation protocol handling, lightweight deployment |
| **Plugins (primary)** | Go | Direct access to k8s libraries, compiles to single binary |
| **Plugins (secondary)** | TypeScript | Community accessibility, gRPC or WASM execution |
| **Future SPA UI** | TypeScript (Svelte/Vue/Angular/React) | Decoupled from backend, community preference |

### 7.2 Why Go Over Alternatives

| Concern | Go | Node.js/TS | Rust | C# |
|---|---|---|---|---|
| K8s ecosystem | Native (client-go, controller-runtime) | Third-party clients | Third-party, less mature | tbd |
| Single binary | Yes | Requires Node runtime | Yes | tbd |
| In-cluster footprint | ~10-30 MB RSS | ~80-150 MB RSS | ~5-15 MB RSS | tbd |
| Concurrency model | Goroutines (excellent for watchers) | Event loop (good for I/O, limited CPU) | Async (excellent, steeper learning curve) | tbd |
| Plugin ecosystem | gRPC + WASM (Wazero) | Native, but heavy runtime | WASM (wasmtime), good | tbd |
| Community for DevOps tooling | Massive (k8s, Terraform, Prometheus all Go) | Growing | Small | tbd |
| Build & deploy | Fast builds, static binary | Needs bundling | Slow builds, static binary | tbd |

Rust would be technically superior for raw performance but Go's ecosystem advantage in the k8s/DevOps space is decisive. The agent will interact with client-go, parse Terraform state (Go structs), and call Prometheus APIs (Go clients) — all of which have battle-tested Go libraries.

### 7.3 Data Storage

| Component | Storage | Rationale |
|---|---|---|
| **Agent** (proof buffer) | Embedded: BadgerDB or SQLite | No external dependencies, survives restarts, minimal footprint |
| **Agent** (observation cache) | In-memory + disk spill | Observations are ephemeral, only kept for verification window |
| **Stats Tracker** (proof chain) | PostgreSQL or SQLite | Event log, append-mostly, needs indexing for chain validation |
| **Stats Tracker** (farm state) | PostgreSQL or SQLite | Materialized projection from proof chain |
| **Village Server** (roster & cache) | PostgreSQL | Multi-farmer state, leaderboards, federation metadata |

**PostgreSQL vs SQLite for Stats Tracker:** If running on a personal laptop, SQLite keeps it zero-dependency. If on a VPS or in Docker, PostgreSQL provides better concurrent access and query capabilities. Support both — SQLite as default, PostgreSQL as optional.

### 7.4 Message Transport

| Path | Protocol | Rationale |
|---|---|---|
| Agent → Stats Tracker | gRPC over TLS (or HTTPS REST fallback) | Efficient, streaming capable, strong typing |
| Stats Tracker → Village Server | HTTPS REST + WebSocket | REST for registration/sync, WebSocket for live updates |
| Village ↔ Village (federation) | HTTPS REST (ActivityPub-inspired) | Standard federation pattern, firewall-friendly |
| Agent ↔ Plugins | gRPC over UDS | Low latency, in-cluster only, no network exposure |

**Why not NATS/EMQX/Kafka for agent→tracker?** For v1, the agent→tracker link is a simple point-to-point connection with a local buffer for resilience. Message brokers add operational complexity on the user's personal machine. If future demand requires it (e.g., many agents reporting to one tracker), NATS Embedded or NATS server is the natural upgrade path — it's Go-native and lightweight.

---

## 8. Data Model & Storage

### 8.1 Stats Tracker — Event Store

```sql
-- Append-only proof log (source of truth)
CREATE TABLE proof_chain (
    proof_id        UUID PRIMARY KEY,
    prev_proof_id   UUID REFERENCES proof_chain(proof_id),
    prev_proof_hash TEXT NOT NULL,
    agent_id        UUID NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    action_type     TEXT NOT NULL,
    category        TEXT NOT NULL,
    subcategory     TEXT,
    description     TEXT NOT NULL,
    outcome_status  TEXT NOT NULL,
    evidence_hash   TEXT NOT NULL,
    complexity      TEXT,
    impact_radius   INT,
    artifacts_touched INT,
    signature       TEXT NOT NULL,
    -- Scoring (computed on insert)
    coins_awarded   INT NOT NULL DEFAULT 0,
    scoring_detail  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure chain integrity
CREATE UNIQUE INDEX idx_proof_chain_prev ON proof_chain(agent_id, prev_proof_id);
```

### 8.2 Stats Tracker — Materialized Projections

```sql
-- Current farm state (rebuilt from proof_chain + purchases)
CREATE TABLE farm (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL DEFAULT 'My Farm',
    total_coins     INT NOT NULL DEFAULT 0,
    current_coins   INT NOT NULL DEFAULT 0,  -- total minus spent
    streak_days     INT NOT NULL DEFAULT 0,
    last_active     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE farm_upgrade (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id         UUID NOT NULL REFERENCES farm(id),
    upgrade_slug    TEXT NOT NULL,
    level           INT NOT NULL DEFAULT 1,
    purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(farm_id, upgrade_slug)
);

CREATE TABLE agent_trust (
    agent_id        UUID PRIMARY KEY,
    public_key      TEXT NOT NULL,
    cluster_alias   TEXT NOT NULL,
    enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'active'  -- active | revoked
);

-- Category stats (materialized for quick queries)
CREATE TABLE category_stats (
    category        TEXT PRIMARY KEY,
    total_proofs    INT NOT NULL DEFAULT 0,
    total_coins     INT NOT NULL DEFAULT 0,
    last_proof_at   TIMESTAMPTZ
);
```

### 8.3 Village Server — Social State

```sql
CREATE TABLE farmer (
    farmer_id       UUID PRIMARY KEY,
    display_name    TEXT NOT NULL,
    tracker_url     TEXT NOT NULL,  -- Stats Tracker API endpoint
    public_key      TEXT NOT NULL,  -- For verifying stats authenticity
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sync_at    TIMESTAMPTZ
);

CREATE TABLE farmer_snapshot (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id       UUID NOT NULL REFERENCES farmer(farmer_id),
    total_coins     INT NOT NULL,
    current_coins   INT NOT NULL,
    streak_days     INT NOT NULL,
    upgrades        JSONB NOT NULL,  -- snapshot of farm_upgrade state
    category_stats  JSONB NOT NULL,  -- snapshot of category_stats
    snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE village (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Federation
CREATE TABLE federated_village (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remote_url      TEXT NOT NULL UNIQUE,
    remote_name     TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending | active | blocked
    last_sync_at    TIMESTAMPTZ
);
```

---

## 9. API Design

### 9.1 API Principles

- **RESTful JSON** for all public APIs (easy to consume from any language/tool)
- **gRPC** for internal high-performance paths (agent↔plugin, agent→tracker proof submission)
- **Versioned:** All endpoints prefixed with `/api/v1/`
- **Authenticated:** Agent→Tracker uses mutual TLS or API key + proof signatures. Tracker→Village uses API key.
- **Documented:** OpenAPI 3.1 spec auto-generated from Go structs

### 9.2 Stats Tracker API

```
# Proof submission (from agents)
POST   /api/v1/proofs                    Submit a new FarmProof
GET    /api/v1/proofs                    List proofs (paginated, filterable)
GET    /api/v1/proofs/:id                Get single proof

# Farm state
GET    /api/v1/farm                      Get current farm state
GET    /api/v1/farm/stats                Aggregate stats (by category, by time)
GET    /api/v1/farm/upgrades             List current upgrades

# Shop & upgrades
GET    /api/v1/shop/items                List available upgrades
POST   /api/v1/shop/purchase             Purchase an upgrade

# Agent management
GET    /api/v1/agents                    List enrolled agents
POST   /api/v1/agents/enroll             Enroll a new agent (requires approval)
POST   /api/v1/agents/:id/approve        Approve pending agent
POST   /api/v1/agents/:id/revoke         Revoke agent trust

# Public profile (for village servers)
GET    /api/v1/public/profile            Public farm profile (no sensitive data)
GET    /api/v1/public/snapshot            Current stats snapshot for village sync

# Health
GET    /healthz                          Liveness
GET    /readyz                           Readiness
```

### 9.3 Village Server API

```
# Registration
POST   /api/v1/farmers/register          Register a Stats Tracker with this village
DELETE /api/v1/farmers/:id               Unregister

# Social
GET    /api/v1/leaderboard               Global leaderboard (sortable by coins, streaks, etc.)
GET    /api/v1/farmers                   List all farmers in this village
GET    /api/v1/farmers/:id               Get farmer profile + farm snapshot
GET    /api/v1/farmers/:id/history        Farm stat history over time

# Federation
GET    /api/v1/federation/info            This village's federation metadata
POST   /api/v1/federation/connect         Request federation with another village
GET    /api/v1/federation/peers           List federated villages
```

### 9.4 Agent API (Minimal, In-Cluster Only)

```
# Plugin management
GET    /api/v1/plugins                   List loaded plugins
POST   /api/v1/plugins/reload             Reload plugin configuration

# Status
GET    /api/v1/status                    Agent health, connected tracker status, proof buffer size
GET    /api/v1/proofs/pending             Proofs buffered but not yet delivered to tracker

# Health
GET    /healthz
GET    /readyz
```

---

## 10. Deployment Models

### 10.1 Farm Agent

**Primary: Helm chart** (in-cluster Kubernetes deployment)

```yaml
# farmops-agent Helm chart
# Deploys:
#   - Agent Deployment (1 replica, low resource requests)
#   - ServiceAccount with read-only ClusterRole
#   - ConfigMap for agent config + plugin manifest
#   - Secret for agent private key + tracker API key
#   - Optional: plugin sidecar containers
```

**Secondary: Standalone binary**
```bash
# For non-k8s environments or edge cases
farmops-agent --config agent.yaml --tracker-url https://my-tracker.local:8443
```

### 10.2 Stats Tracker

**Primary: Docker Compose**
```yaml
services:
  tracker:
    image: ghcr.io/farmops/stats-tracker:latest
    ports:
      - "8443:8443"
    volumes:
      - ./data:/data        # SQLite DB + config
      - ./keys:/keys        # Agent trust store
    environment:
      FARMOPS_DB: "sqlite:///data/farmops.db"
      # OR: FARMOPS_DB: "postgres://..."
```

**Secondary: Standalone binary**
```bash
farmops-tracker --db sqlite:///home/user/.farmops/farm.db --port 8443
```

### 10.3 Village Server

**Primary: Docker Compose** (small groups)
```yaml
services:
  village:
    image: ghcr.io/farmops/village-server:latest
    ports:
      - "8080:8080"
    environment:
      FARMOPS_DB: "postgres://..."
      VILLAGE_NAME: "DevOps Friends"
```

**Secondary: Helm chart** (larger deployments, company-wide)

**Tertiary: Standalone binary** (minimal, Raspberry Pi friendly)
```bash
farmops-village --db sqlite:///data/village.db --name "My Village" --port 8080
```

---

## 11. Integration Targets — Phase 1

### 11.1 Plugin Priority Matrix

| Priority | Plugin | Source | Integration Method |
|---|---|---|---|
| **P0** | `k8s-pod-health` | Kubernetes API | client-go Watch |
| **P0** | `k8s-resource-audit` | Kubernetes API | client-go List/Watch |
| **P0** | `prometheus-alert-resolve` | Alertmanager API | HTTP polling + webhook receiver |
| **P0** | `git-pr-review` | Gitea + GitHub webhooks | Webhook listener |
| **P1** | `terraform-drift` | Terraform state files / Terraform Cloud API | State file parsing + polling |
| **P1** | `terraform-apply` | CI pipeline output | CI webhook / log parsing |
| **P1** | `ansible-run` | Ansible callback plugin | Custom Ansible callback → agent gRPC |
| **P1** | `k8s-deprecated-api` | Kubernetes API | Static analysis of manifests via API |
| **P1** | `certificate-renewal` | Kubernetes Secrets / cert-manager CRDs | Watch cert-manager Certificate resources |
| **P2** | `ci-pipeline` | GitHub Actions / future Jenkins, CircleCI | Webhook listener |
| **P2** | `longhorn-volume-health` | Longhorn API / CRDs | Watch Longhorn Volume CRDs |
| **P2** | `haproxy-config-audit` | HAProxy stats socket / config files | Polling / file watcher |
| **P2** | `emqx-cluster-health` | EMQX REST API | HTTP polling |
| **P3** | `jira-ticket-resolve` | Jira webhooks / REST API | Webhook listener + API polling |
| **P3** | `argocd-sync` | ArgoCD API / CRDs | Watch ArgoCD Application CRDs |
| **P3** | `mysql-backup-verify` | Custom script / S3 API | Cron-triggered verification |
| **P3** | `s3-object-lock-audit` | IONOS S3 API | API polling |

### 11.2 Integration Architecture for K3s Multi-Cluster

Assume a system with two K3s clusters, each running a Farm Agent with a set of plugins.

```
┌──────────────────────┐     ┌─────────────────────┐
│     K3s Cluster A    │     │    K3s Cluster B    │
│                      │     │                     │
│   ┌──────────────┐   │     │   ┌──────────────┐  │
│   │ Farm Agent A │   │     │   │ Farm Agent B │  │
│   │ + plugins    │   │     │   │ + plugins    │  │
│   └──────┬───────┘   │     │   └──────┬───────┘  │
│          │           │     │          │          │
└──────────┼───────────┘     └──────────┼──────────┘
           │                            │
           │ Signed Proofs              │ Signed Proofs
           └──────────┬─────────────────┘
                      │
            ┌─────────▼─────────┐
            │   Stats Tracker   │
            │   (your VPS or    │
            │    laptop)        │
            │                   │
            │   Merges proof    │
            │   chains from     │
            │   both agents     │
            └─────────┬─────────┘
                      │
           ┌──────────┴──────────┐
           │                     │
  ┌────────▼─────────┐  ┌────────▼─────────┐
  │ Village: Gang    │  │ Village: Company │
  │ (3 devops pals)  │  │ (100 engineers)  │
  └──────────────────┘  └──────────────────┘
```

Each cluster runs its own agent. Proofs from all agents converge at the single Stats Tracker. The Stats Tracker connects to as many Village Servers as the user desires.

---

## 12. Security, Privacy & Confidentiality

### 12.1 Threat Model

| Actor | Goal | Mitigation |
|---|---|---|
| **Malicious insider** | Forge achievements | Agent signing + hash chain + plugin auditability |
| **Network attacker** | Intercept proofs | TLS everywhere, proofs contain no sensitive data anyway |
| **Compromised agent** | Submit false proofs | Agent trust model with explicit enrollment + revocation |
| **Curious village server** | Extract work details | Proofs never contain raw data; village sees only aggregate stats |
| **Employer / compliance** | Ensure no data exfiltration | Agent is read-only, proofs contain only hashed evidence, no resource names |

### 12.2 Data Classification

| Data Level | Where it lives | Who can see it | Example |
|---|---|---|---|
| **L0: Raw** | Agent only (ephemeral) | Agent process only | Pod status JSON, Terraform plan output |
| **L1: Evidence** | Agent only (hashed) | Agent process only | Structured verification data, hashed before proof creation |
| **L2: Proof** | Agent → Stats Tracker | User only | "Verified 52 pod health checks, category=maintenance, complexity=low" |
| **L3: Stats** | Stats Tracker → Village | Public (within village) | "Total coins: 1,250. Streak: 14 days. Farm level: 7" |

Each level is strictly more abstract than the previous. No downward flow is possible.

### 12.3 Agent RBAC (Kubernetes)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: farmops-agent-observer
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps", "secrets", "namespaces", "nodes", "events"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets", "daemonsets", "replicasets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["cert-manager.io"]
    resources: ["certificates", "issuers", "clusterissuers"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["longhorn.io"]
    resources: ["volumes", "replicas", "engines"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["argoproj.io"]
    resources: ["applications", "appprojects"]
    verbs: ["get", "list", "watch"]
  # Agent's own namespace for proof buffer
  # (namespace-scoped Role, not ClusterRole)
```

**Explicit non-permissions:** No `create`, `update`, `delete`, `patch`, `exec`, `proxy` on any resource outside the agent's own namespace.

---

## 13. Development Phases

### Phase 0: Foundation (Weeks 1-4)
- Go monorepo setup with `cmd/agent`, `cmd/tracker`, `cmd/village`
- Proof schema definition (protobuf)
- gRPC plugin contract definition
- Ed25519 signing and hash chain library
- Agent: basic Kubernetes watcher (pod health)
- Stats Tracker: proof ingestion, chain validation, SQLite storage
- Stats Tracker: basic scoring engine
- CLI for agent enrollment and proof inspection

### Phase 1: Core Plugins (Weeks 5-10)
- P0 plugins: k8s-pod-health, k8s-resource-audit, prometheus-alert-resolve, git-pr-review
- Stats Tracker: farm state management, shop/upgrade system
- Stats Tracker: REST API (full CRUD for farm, proofs, agents)
- Agent: Helm chart for k3s deployment
- Agent: plugin sidecar loading
- Stats Tracker: Docker Compose deployment

### Phase 2: Extended Plugins + Village (Weeks 11-16)
- P1 plugins: terraform-drift, terraform-apply, ansible-run, k8s-deprecated-api, certificate-renewal
- Village Server: farmer registration, leaderboards, snapshots
- Village Server: basic REST API
- Stats Tracker → Village sync protocol
- Plugin SDK documentation for community authors
- OpenAPI specs published

### Phase 3: Federation + Polish (Weeks 17-22)
- Village ↔ Village federation protocol
- P2 plugins: ci-pipeline, longhorn-volume-health, haproxy-config-audit, emqx-cluster-health
- Streak system, achievements, seasonal events
- Plugin registry (OCI-based)
- Performance optimization (agent footprint, proof throughput)
- Comprehensive documentation

### Phase 4: Community & Ecosystem (Weeks 23+)
- P3 plugins: jira-ticket-resolve, argocd-sync, mysql-backup-verify, s3-object-lock-audit
- TypeScript plugin SDK (gRPC + WASM)
- Reference SPA UI
- Grafana datasource plugin
- VS Code extension (farm status in status bar)
- Community plugin marketplace

---

## Appendix A: Repository Structure (Planned)

```
farmops/
├── cmd/
│   ├── agent/          # Farm Agent binary
│   ├── tracker/        # Stats Tracker binary
│   └── village/        # Village Server binary
├── pkg/
│   ├── proof/          # FarmProof schema, signing, chain validation
│   ├── scoring/        # Scoring engine
│   ├── plugin/         # Plugin runtime, gRPC server/client
│   ├── transport/      # gRPC + REST transport layer
│   └── storage/        # Database abstraction (SQLite + PostgreSQL)
├── plugins/
│   ├── k8s-pod-health/
│   ├── k8s-resource-audit/
│   ├── prometheus-alert-resolve/
│   ├── git-pr-review/
│   ├── terraform-drift/
│   └── ...
├── proto/
│   ├── proof/v1/       # FarmProof protobuf definitions
│   ├── plugin/v1/      # Plugin contract protobuf
│   └── api/v1/         # Public API protobuf (for gRPC gateway)
├── deploy/
│   ├── agent/
│   │   └── helm/       # Agent Helm chart
│   ├── tracker/
│   │   └── docker/     # Stats Tracker Docker Compose
│   └── village/
│       ├── docker/     # Village Docker Compose
│       └── helm/       # Village Helm chart
├── docs/
│   ├── architecture.md
│   ├── motivation.md
│   ├── plugin-authoring.md
│   └── api-reference.md
├── sdk/
│   ├── go/             # Go plugin SDK
│   └── typescript/     # TypeScript plugin SDK
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

---

## Appendix B: Open Questions for Future Resolution

1. **Competitive anti-cheat:** If FarmOps leagues become competitive, how do we prevent coordinated cheating (e.g., a team running fake workloads to generate proofs)? Multi-validator consensus? Reputation systems?
2. **Plugin sandboxing depth:** How much resource isolation do plugins need? Linux namespaces? Firecracker microVMs? WASM memory limits?
3. **Proof pruning:** The proof chain grows indefinitely. When and how can old proofs be archived or compacted while preserving chain integrity?
4. **Offline operation:** If the Stats Tracker is on a laptop that's asleep, agent buffers grow. What's the maximum buffer and catch-up strategy?
5. **Cross-agent events:** Some workflows span multiple tools (Terraform change → CI pipeline → K8s rollout). How do plugins coordinate to recognize composite achievements?
6. **Farm cosmetics and meta-game:** What makes the farm compelling long-term? Seasonal events? Rare items? Trading between farmers?
