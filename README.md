# 🌾 FarmOps

> Gamify your DevOps and SRE maintenance work.

FarmOps is a decentralized, API-first platform that turns routine infrastructure maintenance into verifiable achievements. Agents observe your cluster, produce signed proofs of work, and your personal Stats Tracker converts those proofs into coins for your virtual farm.

See [`docs/motivation.md`](docs/motivation.md) for the full story and [`docs/architecture.md`](docs/architecture.md) for the technical design.

---

## Components

| Binary | Description |
|---|---|
| `farmops-agent` | In-cluster observer. Watches k8s, Terraform, Prometheus, Git. Produces signed `FarmProof` records. |
| `farmops-tracker` | Personal stats server. Validates proof chains, manages farm state, exposes REST API. |
| `farmctl` | CLI for agent enrollment, proof inspection, and tracker management. |

---

## Repository Structure

```
farmops/
├── cmd/
│   ├── agent/          # Farm Agent entrypoint
│   ├── tracker/        # Stats Tracker entrypoint
│   └── farmctl/        # CLI entrypoint
├── pkg/
│   ├── proof/          # FarmProof schema, Ed25519 signing, hash chain
│   ├── scoring/        # Coin scoring engine
│   ├── storage/        # Storage abstraction (BoltDB / SQLite / PostgreSQL)
│   └── transport/      # gRPC + REST transport helpers
├── proto/
│   ├── proof/v1/       # FarmProof protobuf definitions
│   └── plugin/v1/      # Plugin contract protobuf
├── deploy/
│   ├── agent/helm/     # Agent Helm chart (k8s)
│   ├── tracker/docker/ # Stats Tracker Docker Compose
│   └── village/docker/ # Village Server Docker Compose
└── docs/
    ├── architecture.md
    └── motivation.md
```

---

## Development — Phase 0

> Current phase. See [`docs/architecture.md`](docs/architecture.md#13-development-phases) for the full plan.

### Prerequisites

- Go 1.23+
- `protoc` + `protoc-gen-go` + `protoc-gen-go-grpc` (for proto generation)
- `golangci-lint` (optional, for linting)

### Build

```bash
make build          # builds all three binaries into bin/
make agent          # agent only
make tracker        # tracker only
make farmctl        # CLI only
```

### Generate protobuf

```bash
make proto
```

### Test

```bash
make test
```

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
