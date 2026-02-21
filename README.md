# 🌾 FarmOps

**FARM** = Framework for Automated Reliability Maintenance

FarmOps is an open-source, self-hosted platform that **gamifies DevOps and SRE maintenance work**. It mines maintenance tasks from GitHub, awards coins based on verifiable outcomes, and lets teams spend those coins on reliability-themed upgrades inside a "Cloud Farm" interface.

---

## Features

- **Task Mining** — Automatically detects GitHub Issues and PRs with labels like `maintenance`, `toil`, `reliability`, `security`
- **Verified Rewards** — Coins are awarded when a PR is merged and CI checks pass
- **Cloud Farm UI** — Spend coins on upgrades that boost future reward multipliers
- **Configurable Scoring** — Base coins, multipliers, and thresholds are all configurable
- **Minimal Dependencies** — Only Kubernetes + PostgreSQL required (no Redis, no external queues)
- **GitHub App Integration** — Secure webhook ingestion with signature validation and idempotency

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 15 (App Router) |
| Database ORM | Prisma |
| Job Queue | Graphile Worker (Postgres-backed) |
| Auth | NextAuth v5 (GitHub OAuth) |
| Styling | Tailwind CSS + Radix UI |
| Runtime | Node.js 20 |
| Infrastructure | Kubernetes + Helm |

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- A GitHub App ([create one here](https://github.com/settings/apps/new))

### 1. Clone and install

```bash
git clone https://github.com/your-org/farmops.git
cd farmops
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your GitHub App credentials
```

### 3. Start PostgreSQL

```bash
docker compose up postgres -d
```

### 4. Run database migrations and seed

```bash
npm run db:migrate:dev
npm run db:seed
```

### 5. Start the web server and worker

```bash
# Terminal 1 — Web server
npm run dev

# Terminal 2 — Background worker
npm run worker
```

Open [http://localhost:3000](http://localhost:3000) and sign in with GitHub.

---

## GitHub App Setup

1. Go to **GitHub → Settings → Developer Settings → GitHub Apps → New GitHub App**
2. Set the **Webhook URL** to `https://your-domain.com/api/webhooks/github`
3. Set a **Webhook Secret** and save it as `GITHUB_WEBHOOK_SECRET`
4. Grant these permissions:
   - **Metadata**: Read
   - **Issues**: Read
   - **Pull requests**: Read
   - **Checks**: Read (recommended)
5. Subscribe to events: `issues`, `pull_request`, `check_suite` (or `workflow_run`)
6. Install the App in your GitHub organization
7. Copy the **App ID**, **Client ID/Secret**, and generate a **Private Key**

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret for NextAuth session encryption |
| `NEXTAUTH_URL` | Public URL of the FarmOps instance |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | GitHub App private key (PEM format, `\n` escaped) |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret for signature validation |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `FARMOPS_VERIFICATION_MODE` | `checks` (default) or `merge_only` |
| `FARMOPS_LABELS` | Comma-separated tracked labels (default: `maintenance,toil,reliability,security`) |

---

## Scoring Model

```
coins = round(base × verification_multiplier × size_multiplier × upgrade_multiplier)
```

| Task Type | Base Coins |
|---|---|
| `maintenance` | 10 |
| `toil` | 15 |
| `reliability` | 20 |
| `security` | 25 |

| Multiplier | Value |
|---|---|
| CI checks passed | ×1.25 |
| Merge only | ×1.0 |
| Small PR (<100 LOC) | ×1.0 |
| Medium PR (100–500 LOC) | ×1.1 |
| Large PR (>500 LOC) | ×1.2 |

All values are configurable via the `Config` database table.

---

## Farm Upgrades (Shop)

| Upgrade | Effect | Base Cost |
|---|---|---|
| 🛖 Auto-Patch Shed | Boosts `MAINTENANCE` rewards | 100 coins |
| 🏚️ Runbook Barn | Boosts `TOIL` rewards | 120 coins |
| 🧹 Alert Scarecrow | Boosts `TOIL` rewards | 150 coins |
| 🪣 Backup Well | Boosts `RELIABILITY` rewards | 200 coins |
| 🌀 CI Windmill | Universal boost (all types) | 180 coins |
| 🔒 Security Fence | Boosts `SECURITY` rewards | 250 coins |

Each upgrade has 3 levels. Cost scales with level.

---

## Kubernetes Deployment

### Using Helm

```bash
# Add dependencies (Bitnami for PostgreSQL)
helm repo add bitnami https://charts.bitnami.com/bitnami
helm dependency update helm/farmops

# Install
helm install farmops ./helm/farmops \
  --namespace farmops \
  --create-namespace \
  --set secrets.NEXTAUTH_SECRET="your-secret" \
  --set secrets.GITHUB_APP_ID="123456" \
  --set secrets.GITHUB_PRIVATE_KEY="$(cat private-key.pem)" \
  --set secrets.GITHUB_WEBHOOK_SECRET="your-webhook-secret" \
  --set secrets.GITHUB_CLIENT_ID="your-client-id" \
  --set secrets.GITHUB_CLIENT_SECRET="your-client-secret" \
  --set env.NEXTAUTH_URL="https://farmops.example.com" \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=farmops.example.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix
```

### Health Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/healthz` | Liveness check |
| `GET /api/readyz` | Readiness check (DB connectivity) |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/webhooks/github` | GitHub webhook receiver |
| `GET` | `/api/orgs/me` | List user's organizations |
| `GET` | `/api/repos` | List repositories |
| `POST` | `/api/repos/:id/enable` | Enable/disable a repository |
| `GET` | `/api/tasks` | List tasks (filterable by status) |
| `GET` | `/api/wallet` | Get wallet balance and recent rewards |
| `GET` | `/api/farm` | Get farm state and upgrades |
| `GET` | `/api/shop` | List shop items |
| `POST` | `/api/shop/buy` | Purchase an upgrade |
| `POST` | `/api/admin/sync` | Trigger repository sync |
| `GET` | `/api/healthz` | Liveness probe |
| `GET` | `/api/readyz` | Readiness probe |

---

## Worker Jobs

| Job | Trigger | Description |
|---|---|---|
| `process_github_event` | On webhook | Parses events, creates/updates tasks, issues rewards |
| `sync_repos` | Every 6h + manual | Syncs repositories from GitHub App installations |
| `recompute_wallet` | Daily | Recalculates wallet balances for integrity |

---

## Project Structure

```
farmops/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   │   ├── webhooks/github # GitHub webhook endpoint
│   │   │   ├── orgs/           # Organization endpoints
│   │   │   ├── repos/          # Repository endpoints
│   │   │   ├── tasks/          # Task endpoints
│   │   │   ├── wallet/         # Wallet endpoints
│   │   │   ├── farm/           # Farm endpoints
│   │   │   ├── shop/           # Shop endpoints
│   │   │   └── admin/          # Admin endpoints
│   │   ├── dashboard/          # Dashboard UI pages
│   │   └── login/              # Login page
│   ├── components/             # Shared React components
│   ├── lib/                    # Core libraries
│   │   ├── auth.ts             # NextAuth configuration
│   │   ├── prisma.ts           # Prisma client singleton
│   │   ├── github.ts           # GitHub utilities
│   │   ├── queue.ts            # Graphile Worker queue helper
│   │   ├── scoring.ts          # Coin scoring engine
│   │   └── utils.ts            # Shared utilities
│   └── worker/                 # Background worker
│       ├── index.ts            # Worker entry point
│       └── jobs/               # Job handlers
│           ├── process-github-event.ts
│           ├── sync-repos.ts
│           └── recompute-wallet.ts
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Seed data (shop items, config)
├── helm/farmops/               # Helm chart
├── docker-compose.yml          # Local development
├── Dockerfile                  # Multi-stage build (web + worker)
└── .env.example                # Environment variable template
```

---

## Contributing

FarmOps is open-source and welcomes contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 — see [LICENSE](LICENSE).
