BINARY_DIR := bin
MODULE     := github.com/farmops/farmops

.PHONY: all build agent tracker farmctl proto lint test clean

all: build

build: agent tracker farmctl

agent:
	go build -o $(BINARY_DIR)/farmops-agent ./cmd/agent

tracker:
	go build -o $(BINARY_DIR)/farmops-tracker ./cmd/tracker

farmctl:
	go build -o $(BINARY_DIR)/farmctl ./cmd/farmctl

proto:
	protoc \
		--go_out=. --go_opt=paths=source_relative \
		--go-grpc_out=. --go-grpc_opt=paths=source_relative \
		proto/proof/v1/proof.proto \
		proto/plugin/v1/plugin.proto

lint:
	golangci-lint run ./...

test:
	go test ./... -v -race -count=1

clean:
	rm -rf $(BINARY_DIR)
