# E2E Testing with Testcontainers

This directory contains the E2E test setup that uses Docker containers and Playwright's lifecycle hooks to provide a complete test environment.

## Quick Start

Simply run the E2E tests as usual:

```bash
bun run e2e-test
```

Playwright's globalSetup will automatically:
1. Start all required Docker containers (Redpanda, Kafka Connect, OwlShop)
2. Wait for services to be healthy
3. Start backend and frontend servers
4. Run the Playwright tests
5. Clean up everything after tests complete (via globalTeardown)

## Services

The following services are automatically started:

- **Redpanda** (Kafka-compatible): `localhost:19092`
- **Schema Registry**: `http://localhost:18081`
- **Admin API**: `http://localhost:19644`
- **Kafka Connect**: `http://localhost:18083` (optional - tests continue if slow to start)
- **OwlShop** (data generator): generates sample data

Setup typically completes in 30-40 seconds with health checks for all critical services.

## Configuration

### Docker Compose

The docker-compose configuration is in `tests/config/docker-compose.yaml`. It includes:
- Redpanda with SASL authentication (user: `e2euser`, password: `very-secret`)
- Kafka Connect with SASL configuration
- OwlShop for generating test data

### Console Configuration

The backend configuration is in `tests/config/console.config.yaml` and matches the docker-compose setup.

## Architecture

The E2E test setup uses Playwright's lifecycle hooks:

- **`global-setup.mjs`**: Runs once before all tests
  - Starts Docker containers (Redpanda, Kafka Connect, OwlShop)
  - Waits for services to be healthy
  - Starts backend (Go) and frontend (Bun) servers
  - Saves process IDs for cleanup

- **`global-teardown.mjs`**: Runs once after all tests
  - Stops backend and frontend servers
  - Stops and removes Docker containers
  - Cleans up state files

## Manual Management

If you need to manually manage the environment:

### Start everything
```bash
cd tests && node -e "import('./global-setup.mjs').then(m => m.default())"
```

### Stop everything
```bash
cd tests && node -e "import('./global-teardown.mjs').then(m => m.default())"
```

### Check status
```bash
docker ps | grep -E "redpanda|connect|owlshop"
lsof -i :9090  # Backend
lsof -i :3000  # Frontend
```

## Troubleshooting

### Containers not starting
If containers fail to start, check:
1. Docker is running
2. Ports 19092, 18081, 18083, 19644 are not in use
3. Check Docker logs: `docker logs redpanda`

### Services not ready
The setup performs health checks for all services:
- Redpanda health check: up to 30 seconds
- Admin API: up to 15 seconds
- Schema Registry: up to 15 seconds
- Kafka Connect (optional): up to 10 seconds - tests continue if not ready

If services take longer than expected:
- Check Docker resources (memory/CPU)
- Review container logs: `docker logs redpanda`
- The tests will continue even if Kafka Connect is slow (with a warning)

## Files

- **`global-setup.mjs`** - Playwright globalSetup hook
  - Starts Docker containers
  - Starts backend and frontend servers
  - Waits for all services to be ready

- **`global-teardown.mjs`** - Playwright globalTeardown hook
  - Stops web servers
  - Stops and removes Docker containers

- **`config/docker-compose.yaml`** - Docker Compose configuration
  - Redpanda with SASL authentication
  - Kafka Connect
  - OwlShop data generator

- **`config/console.config.yaml`** - Redpanda Console backend configuration
- **`config/conf/.bootstrap.yaml`** - Redpanda bootstrap configuration
