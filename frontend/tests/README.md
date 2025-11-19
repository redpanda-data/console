# E2E Testing with Testcontainers

This directory contains the E2E test setup that uses Docker containers to provide a complete test environment.

## Quick Start

Simply run the E2E tests as usual:

```bash
bun run e2e-test
```

The test script will automatically:
1. Start all required Docker containers (Redpanda, Kafka Connect, OwlShop)
2. Wait for services to be healthy
3. Run the Playwright tests
4. Clean up containers after tests complete

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

## Manual Container Management

If you need to manually manage the containers:

### Start containers
```bash
cd tests
node global-setup.mjs
```

### Stop containers
```bash
cd tests
node global-teardown.mjs
```

### Check container status
```bash
docker ps | grep -E "redpanda|connect|owlshop"
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

### Cleanup issues
If containers are left running after tests:
```bash
docker compose -f tests/config/docker-compose.yaml -p redpanda-e2e down -v
```

## Files

- `global-setup.mjs` - Starts docker-compose environment
- `global-teardown.mjs` - Stops and cleans up containers
- `start-e2e.sh` - Wrapper script that ensures containers start before tests
- `config/docker-compose.yaml` - Docker Compose configuration
- `config/console.config.yaml` - Redpanda Console configuration
- `config/conf/.bootstrap.yaml` - Redpanda bootstrap configuration
