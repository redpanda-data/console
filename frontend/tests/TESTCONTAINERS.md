# Testcontainers E2E Test Setup

## Architecture

The E2E test environment runs the Go backend in a Docker container using testcontainers. The backend serves both the API and frontend static files, providing a production-like deployment environment.

### Network Configuration

All containers run on a shared Docker network created by testcontainers:

```
┌────────────────────────────────────────────────────────────────┐
│                      Docker Network                             │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────┐          │
│  │  Redpanda    │◄──│   Backend    │   │  OwlShop  │          │
│  │              │   │  Container   │   │           │          │
│  │ redpanda:9092│   │              │   │           │          │
│  │ redpanda:8081│   │ Port 3000:   │   │           │          │
│  │ redpanda:9644│   │ - API        │   │           │          │
│  └──────────────┘   │ - Frontend   │   └───────────┘          │
│         │           └──────────────┘         │                 │
│         │                  │                 │                 │
└─────────┼──────────────────┼─────────────────┼─────────────────┘
          │                  │                 │
          │                  │                 │
    localhost:19092    localhost:3000    (internal only)
    localhost:18081
    localhost:19644
          │                  │
          └──────────────────┴─────► Browser/Tests
```

### Port Mappings

**Redpanda:**
- Internal: `redpanda:9092` (Kafka), `redpanda:8081` (Schema Registry), `redpanda:9644` (Admin API)
- External: `localhost:19092`, `localhost:18081`, `localhost:19644`

**Backend Container:**
- Internal: `console-backend:3000`
- External: `localhost:3000`
- Serves both API and compiled frontend (`serveFrontend: true` in config)
- Connects to Redpanda using internal network addresses

**OwlShop:**
- Internal only (no external ports exposed)
- Generates test data for Kafka topics

## Files

### Dockerfile
**`tests/config/Dockerfile.backend`** - Multi-stage Docker build:
1. **Builder stage**:
   - Uses `golang:alpine` with `GOTOOLCHAIN=auto` to support Go 1.25.1+
   - Compiles the Go backend binary (`console-api`)
   - CGO disabled for static binary
2. **Runtime stage**:
   - Minimal Alpine Linux (3.21)
   - Includes `ca-certificates` (HTTPS) and `wget` (healthcheck)
   - Exposes port 3000

### Configuration
**`tests/config/console.config.yaml`** - Backend configuration mounted into container:
- `serveFrontend: true` - Backend serves compiled frontend assets
- `server.listenPort: 3000` - Single port for API and frontend
- Internal Docker network addresses:
  - `kafka.brokers: ["redpanda:9092"]` - Kafka broker
  - `schemaRegistry.urls: ["http://redpanda:8081"]` - Schema Registry
  - `redpanda.adminApi.urls: ["http://redpanda:9644"]` - Admin API
  - `kafkaConnect.clusters[].url: http://connect:8083` - Kafka Connect
- SASL authentication: `e2euser:very-secret` (SCRAM-SHA-256)

### Setup Script
**`tests/global-setup.mjs`**:
1. **Build Phase**:
   - Builds backend Docker image from source: `console-backend:e2e-test`
   - Uses multi-stage Dockerfile for optimized image
2. **Infrastructure Phase**:
   - Creates shared Docker network via testcontainers
   - Starts Redpanda container with SASL auth
   - Starts OwlShop container (test data generator)
   - Optionally starts Kafka Connect container
3. **Application Phase**:
   - Starts backend container on port 3000
   - Mounts `console.config.yaml` into container
   - Waits for port 3000 to be ready
   - Waits for frontend to serve HTML
4. **State Management**:
   - Saves container IDs to `.testcontainers-state.json`

### Teardown Script
**`tests/global-teardown.mjs`**:
- Reads container IDs from state file
- Stops backend container
- Stops Redpanda, OwlShop, Connect containers
- Removes Docker network
- Cleans up state file

## Benefits

1. **Production Parity**: Backend runs in Docker exactly as it would in production
2. **Complete Isolation**: All services run in containers with no host dependencies
3. **Realistic Networking**: Tests actual container-to-container communication over Docker networks
4. **Reproducibility**: Docker images ensure identical environments across machines
5. **CI/CD Ready**: No local Go toolchain or Node.js dev server required
6. **Single Binary**: Backend serves both API and pre-compiled frontend assets
7. **Fast Startup**: Docker image caching makes subsequent runs faster
8. **Clean Teardown**: All resources cleaned up via testcontainers API

## Usage

Run E2E tests (setup and teardown are automatic):

```bash
bun run e2e-test              # Run all tests
bun run e2e-test:ui           # Run with Playwright UI
```

### First Run
- Builds backend Docker image (~2-3 minutes)
- Pulls container images (Redpanda, OwlShop)
- Starts all containers and waits for readiness

### Subsequent Runs
- Reuses cached Docker image (unless backend source changes)
- Faster startup (~30-60 seconds)

### Debugging
Access services during test runs:
- Frontend: http://localhost:3000
- Redpanda Admin: http://localhost:19644
- Schema Registry: http://localhost:18081

View container logs:
```bash
docker ps                              # Find container IDs
docker logs <backend-container-id>     # View backend logs
docker logs <redpanda-container-id>    # View Redpanda logs
```

### Manual Cleanup
If tests fail to clean up:
```bash
docker ps -a | grep e2e-test           # Find containers
docker stop $(docker ps -aq --filter name=e2e)
docker network prune                   # Remove networks
```
