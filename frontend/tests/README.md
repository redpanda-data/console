# E2E Testing with Testcontainers

This directory contains the E2E test setup that uses Docker containers and Playwright's lifecycle hooks to provide a complete test environment.

## Playwright Test Agents

This project uses Playwright's test agents for AI-assisted test creation and maintenance:

- **Planner Agent** - Explores the application and creates detailed test plans in `specs/`
- **Generator Agent** - Converts test plans into executable Playwright tests
- **Healer Agent** - Automatically debugs and fixes failing tests

### Test Plans

Test plans are stored in the `specs/` directory as markdown files. Each plan contains:
- Application overview and features
- Detailed test scenarios with step-by-step instructions
- Expected results and success criteria
- Reference to seed test for environment setup

**Available test plans:**
- `specs/topics.md` - Comprehensive test plan for Topics page (78 scenarios)

### Using Test Agents

To use the test agents, describe what you need in natural language:

```bash
# Create a test plan
"Create a test plan for the /connectors page"

# Generate tests from a plan
"Generate tests from specs/topics.md"

# Fix failing tests
"Fix the failing tests in tests/console/topic.spec.ts"
```

The agents run autonomously and will create test files in the `tests/` directory.

### Seed Test

The `tests/seed.spec.ts` file establishes the baseline environment for test agents:
- Navigates to application homepage
- Verifies basic application functionality
- Provides context for test planning and generation

Agents reference this seed test to understand your application's setup.

## Quick Start

### Run All Tests (Full Automation)

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

### Run Individual Tests (Development Workflow)

For faster development iterations, set up the environment once and run specific tests:

```bash
# 1. Start all services (Docker, backend, frontend)
bun run e2e-test:setup

# 2. Run individual tests without global setup/teardown
npx playwright test tests/console/topic-list.spec.ts --config playwright.config.ts

# Or run specific test
npx playwright test tests/console/topic-list.spec.ts:21 --config playwright.config.ts

# Or use UI mode for debugging
npx playwright test tests/console/topic-list.spec.ts --ui --config playwright.config.ts

# 3. When done, clean up everything
bun run e2e-test:teardown
```

**Benefits:**
- ⚡ Faster test iterations (no 30-40s setup per run)
- 🔍 Better for debugging specific tests
- 🎯 Run only the tests you're working on
- 🖥️ Keep services running between test runs

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
# Check Docker containers
docker ps | grep -E "redpanda|connect|owlshop"

# Check backend (Go server on port 9090)
lsof -i :9090

# Check frontend (Bun/Rsbuild on port 3000)
lsof -i :3000

# Check if services are responding
curl http://localhost:9090/api/cluster/overview  # Backend API
curl http://localhost:3000  # Frontend
```

### Development Tips

When using `e2e-test:setup` for development:

1. **Keep services running** - No need to tear down between test runs
2. **Watch logs** - Terminal shows backend/frontend logs for debugging
3. **Restart services** - If something breaks, run teardown then setup again
4. **Check state files** - Process IDs stored in `tests/state/`
5. **Manual cleanup** - If teardown fails, use:
   ```bash
   # Stop processes
   pkill -f "go run"
   pkill -f "bun.*start"

   # Stop containers
   docker stop redpanda owlshop kafka-connect 2>/dev/null
   docker rm redpanda owlshop kafka-connect 2>/dev/null
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
