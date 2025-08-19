# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Redpanda Console is a web application for managing and debugging Kafka/Redpanda workloads. It consists of two main components:

1. **Frontend**: React SPA built with TypeScript, RSBuild, and Chakra UI
2. **Backend**: Go HTTP API server that interfaces with Kafka/Redpanda clusters

## Build and Development Commands

### Frontend (Node.js/Bun)
- `bun install` - Install dependencies
- `bun start` - Start development server (http://localhost:3000)
- `bun build` - Build for production
- `bun test` - Run unit tests
- `bun run e2e-test` - Run end-to-end tests
- `bun run type:check` - Run TypeScript type checking
- `bun run lint` - Run Biome linter and formatter
- `bun run format` - Format code with Biome

### Backend (Go)
Use the Task runner (requires `task` CLI tool):
- `task backend:fmt` - Format Go code
- `task backend:lint` - Run golangci-lint
- `task backend:test-unit` - Run unit tests
- `task backend:test-integration` - Run integration tests (requires Docker)
- `task backend:cover` - Run tests with coverage
- `task backend:verify` - Run linting and all tests
- `task backend:generate` - Generate code (mocks, protobuf)

### Development Setup
Start backend: `KAFKA_BROKERS=localhost:9092 SERVEFRONTEND=false SERVER_LISTENPORT=9090 go run cmd/api/main.go`
Start local Redpanda cluster: `docker compose up -d` (in `/docs/local` directory)

## Architecture

### Backend Structure
- `cmd/api/main.go` - Application entry point
- `pkg/api/` - HTTP handlers and Connect/gRPC services
- `pkg/console/` - Core Kafka interaction logic
- `pkg/connect/` - Kafka Connect integration
- `pkg/serde/` - Message serialization/deserialization (JSON, Avro, Protobuf, etc.)
- `pkg/config/` - Configuration management
- `pkg/connector/` - Connector-specific logic and guides
- `protogen/` - Generated protobuf code

### Frontend Structure
- `src/components/pages/` - Page-level React components
- `src/state/` - MobX state management
- `src/protogen/` - Generated Connect/protobuf TypeScript code
- `src/react-query/` - API query hooks using TanStack Query

### Key Technologies
- **Backend**: Go, Connect (gRPC-Web), franz-go (Kafka client), Testcontainers
- **Frontend**: React 18, TypeScript, MobX, RSBuild, Chakra UI, TanStack Query
- **Protocols**: Connect/gRPC for API communication, protobuf schemas
- **Testing**: Vitest (frontend), Go testing + Testcontainers (backend), Playwright (E2E)

### Configuration
- Backend config via YAML files or environment variables
- Frontend config via environment variables (REACT_APP_* prefix)
- Development proxy setup: frontend (port 3000) → backend (port 9090)

### Message Serialization
The application supports multiple message formats through the serde package:
- JSON, Avro, Protobuf, CBOR, XML, MessagePack, Text, Binary
- Schema Registry integration for Avro/Protobuf
- Custom encoding detection and transformation

### Enterprise Features
- License management system
- RBAC with users, roles, and ACLs
- SASL-SCRAM user management
- Debug bundle generation

## Important Notes

- Always run `task backend:fmt` before committing Go code
- Use `bun run lint` to format frontend code
- Integration tests require Docker for Testcontainers
- The codebase uses Connect (not traditional gRPC) for API communication
- Frontend uses MobX for state management, but for new components, lets consider using TanStack Query for data fetching or React useState
- RSBuild (not Webpack/Vite) is used for frontend bundling
