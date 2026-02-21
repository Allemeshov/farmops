# 🧪 FarmOps Local Testing Runbook

Check off each step as you complete it. Commands are copy-pasteable.
**No GitHub account required** — uses a seeded dev user and mock data.

---

## Phase 1 — Infrastructure

### 1.1 Start PostgreSQL

```bash
docker compose up postgres -d
```

- [ ] Command ran without error
- [ ] Verify: `docker compose ps` shows `postgres` as **healthy**

```bash
docker compose ps
```

---

### 1.2 Run Migrations

```bash
npm run db:migrate:dev
```

- [ ] Migration applied without error
- [ ] Verify: output ends with `Your database is now in sync with your schema.`

---

### 1.3 Seed the Database

```bash
npm run db:seed
```

- [ ] Output: `Seed complete.`
- [ ] Output: `Dev data seeded. User wallet: NNN coins.`

**What was created:**
- Dev user: `dev@farmops.local` / `Dev Farmer`
- Org: `Dev Organization` (you are OWNER)
- 3 repos: `platform` (enabled), `infra` (enabled), `docs` (disabled)
- 6 tasks: 4 DONE with rewards, 1 IN_PROGRESS, 1 OPEN
- Farm with 1 upgrade: CI Windmill (level 1)

---

### 1.4 Set Minimal Environment Variables

Create a `.env` file (if not already done):

```bash
cp .env.example .env
```

Then set the minimum required values for local dev:

```env
DATABASE_URL=postgresql://farmops:farmops@localhost:5432/farmops
NEXTAUTH_SECRET=dev-secret-local-testing-only
NEXTAUTH_URL=http://localhost:3000
# GitHub vars can be left as placeholders for dev login
GITHUB_CLIENT_ID=dev
GITHUB_CLIENT_SECRET=dev
GITHUB_APP_ID=0
GITHUB_PRIVATE_KEY=dev
GITHUB_WEBHOOK_SECRET=dev-webhook-secret
```

- [ ] `.env` file exists with the values above

---

## Phase 2 — Start the App

### 2.1 Start the Web Server

```bash
npm run dev
```

- [ ] Server starts on `http://localhost:3000`
- [ ] No fatal startup errors in terminal

---

### 2.2 Login Without GitHub

Open [http://localhost:3000](http://localhost:3000)

- [ ] Redirected to `/login` page
- [ ] Login page shows **"Sign in with GitHub"** button
- [ ] Login page shows **"Dev Login (no GitHub)"** amber button (dev only)
- [ ] Click **"Dev Login (no GitHub)"**
- [ ] Redirected to `/dashboard`
- [ ] Dashboard shows: `Welcome back, Dev Farmer 👋`

---

## Phase 3 — Dashboard Pages

### 3.1 Dashboard Overview (`/dashboard`)

- [ ] Coin Balance stat card shows a non-zero number
- [ ] Open Tasks card shows `2`
- [ ] Completed Tasks card shows `4`
- [ ] "Recent Rewards" section shows at least 4 entries with coin amounts
- [ ] Quick Start guide is visible

---

### 3.2 Tasks Page (`/dashboard/tasks`)

```
http://localhost:3000/dashboard/tasks
```

- [ ] Table loads with 6 tasks
- [ ] Filter **"Done"** → shows 4 tasks, all with coin rewards
- [ ] Filter **"Open"** → shows 1 task (toil, no reward)
- [ ] Filter **"In Progress"** → shows 1 task (maintenance, no reward)
- [ ] Filter **"All"** → shows all 6 tasks
- [ ] Task type badges show correct colors (blue=MAINTENANCE, orange=TOIL, green=RELIABILITY, red=SECURITY)

---

### 3.3 Wallet Page (`/dashboard/wallet`)

```
http://localhost:3000/dashboard/wallet
```

- [ ] Yellow "Coin Balance" card shows correct total
- [ ] "Recent Rewards" list shows 4 rewards with breakdown (Base / Verify / Size / Upgrade multipliers)
- [ ] Verify the math for one reward manually:
  - `chore: upgrade Node.js` → base=10 × verify=1.25 × size=1.0 × upgrade=1.0 = **13 coins**
  - `fix: remove manual alert silencing` → base=15 × 1.25 × 1.1 × 1.0 = **21 coins**
  - `feat: add automated backup verification` → base=20 × 1.25 × 1.2 × 1.0 = **30 coins**
  - `security: rotate leaked API keys` → base=25 × 1.0 × 1.0 × 1.0 = **25 coins**
- [ ] Totals match what's shown in the UI

---

### 3.4 Farm Page (`/dashboard/farm`)

```
http://localhost:3000/dashboard/farm
```

- [ ] "Dev Organization" is selected in the org dropdown
- [ ] "Active Upgrades" shows **CI Windmill** at level 1
- [ ] Level bar shows 1/3 filled
- [ ] "Repository Plots" shows 2 repos: `dev-org/platform` and `dev-org/infra`
- [ ] `dev-org/docs` is NOT shown (disabled)

---

### 3.5 Shop Page (`/dashboard/shop`)

```
http://localhost:3000/dashboard/shop
```

- [ ] All 6 shop items are listed with icons, names, descriptions
- [ ] Coin balance shown in top-right matches wallet balance
- [ ] Items you can afford have an active **"Buy / Upgrade"** button
- [ ] Click **"Buy / Upgrade"** on an affordable item
- [ ] Success message: `Upgraded to level N! 🎉`
- [ ] Coin balance decreases by the item cost

---

### 3.6 Repositories Page (`/dashboard/repos`)

```
http://localhost:3000/dashboard/repos
```

- [ ] 3 repos listed: `platform`, `infra`, `docs`
- [ ] `platform` and `infra` show **Enabled** badge
- [ ] `docs` shows **Disabled** badge
- [ ] Click **"Disable"** on `platform` → badge changes to Disabled
- [ ] Click **"Enable"** on `platform` → badge changes back to Enabled

---

### 3.7 Admin Page (`/dashboard/admin`)

```
http://localhost:3000/dashboard/admin
```

- [ ] Page loads with "Sync Repositories" and "Configuration" cards
- [ ] Click **"Sync Now"** button
- [ ] Result: amber/red message (expected — no real GitHub App installed, worker not running)
- [ ] Scoring Reference table shows correct base coin values (10/15/20/25)

---

## Phase 4 — API Endpoints (curl)

Run these while the dev server is running. Replace the cookie value with your actual session cookie from browser DevTools → Application → Cookies → `next-auth.session-token`.

### 4.1 Health Checks

```bash
curl http://localhost:3000/api/healthz
```
- [ ] Response: `{"status":"ok"}`

```bash
curl http://localhost:3000/api/readyz
```
- [ ] Response: `{"status":"ready"}`

---

### 4.2 Webhook Endpoint (simulated event)

Test the webhook signature verification with a bad secret (should reject):

```bash
curl -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -H "X-GitHub-Delivery: test-delivery-001" \
  -H "X-Hub-Signature-256: sha256=badhash" \
  -d '{"zen":"Keep it logically awesome."}'
```
- [ ] Response: `{"error":"Invalid signature"}` (401)

Test with correct signature (requires `GITHUB_WEBHOOK_SECRET=dev-webhook-secret`):

```bash
PAYLOAD='{"zen":"Keep it logically awesome."}'
SECRET="dev-webhook-secret"
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print "sha256="$2}')

curl -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -H "X-GitHub-Delivery: test-delivery-002" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$PAYLOAD"
```
- [ ] Response: `{"ok":true}` (ping events are accepted and stored)

---

## Phase 5 — Worker (Optional)

The worker processes background jobs. Start it in a separate terminal:

```bash
npm run worker
```

- [ ] Worker starts and logs: `Worker connected`
- [ ] No fatal errors on startup

> **Note:** Without a real GitHub App, `sync_repos` will fail gracefully. This is expected.

---

## Phase 6 — Database Inspection

Use Prisma Studio to browse all data visually:

```bash
npm run db:studio
```

- [ ] Studio opens at `http://localhost:5555`
- [ ] `User` table: 1 row (`dev@farmops.local`)
- [ ] `Organization` table: 1 row (`dev-org`)
- [ ] `Repository` table: 3 rows
- [ ] `Task` table: 6 rows
- [ ] `Reward` table: 4 rows
- [ ] `Wallet` table: 2 rows (user + org)
- [ ] `Farm` table: 1 row
- [ ] `FarmUpgrade` table: 1 row (CI Windmill, level 1)
- [ ] `ShopItem` table: 6 rows
- [ ] `Config` table: 11 rows

---

## Phase 7 — Reset & Repeat

To wipe and re-seed from scratch:

```bash
# Drop and recreate the database
docker compose down -v
docker compose up postgres -d
npm run db:migrate:dev
npm run db:seed
```

- [ ] Clean state confirmed in Prisma Studio

---

## Summary

| Phase | Area | Status |
|---|---|---|
| 1 | Infrastructure (DB, migrations, seed) | ⬜ |
| 2 | App startup + dev login | ⬜ |
| 3.1 | Dashboard overview | ⬜ |
| 3.2 | Tasks page | ⬜ |
| 3.3 | Wallet page | ⬜ |
| 3.4 | Farm page | ⬜ |
| 3.5 | Shop (buy flow) | ⬜ |
| 3.6 | Repos (enable/disable) | ⬜ |
| 3.7 | Admin page | ⬜ |
| 4 | API endpoints (curl) | ⬜ |
| 5 | Worker startup | ⬜ |
| 6 | Database inspection | ⬜ |
