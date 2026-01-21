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

## Test Variants

This project supports multiple test variants for different configurations. Each variant has its own:
- Configuration file (`tests/config/console.[variant].config.yaml`)
- Test directory (`tests/console-[variant]/`)
- Playwright config (`playwright.[variant].config.ts`)
- Isolated port allocations (no conflicts)
- Independent container lifecycle

### Available Variants

View all configured variants:
```bash
bun run variant:list
```

**Currently configured:**
- **console** (OSS) - Open-source tests without enterprise features
- **console-enterprise** (Enterprise) - Enterprise tests with authentication and shadowlink

### Running Variant Tests

```bash
# Run OSS tests
bun run e2e-test

# Run Enterprise tests
bun run e2e-test-enterprise

# Run with UI mode
bun run e2e-test:ui
bun run e2e-test-enterprise:ui

# Run using variant CLI
bun run variant run console
bun run variant run console-enterprise
```

### Parallel Execution

Variants use isolated ports, enabling parallel execution:

```bash
# Terminal 1 - Run OSS tests
bun run e2e-test

# Terminal 2 - Run Enterprise tests simultaneously
bun run e2e-test-enterprise

# No port conflicts!
```

### Port Allocation

Each variant uses a dedicated port range (offset by +100):

| Variant | Backend | Kafka | Schema Registry | Admin API | Connect |
|---------|---------|-------|-----------------|-----------|---------|
| console | 3000 | 19092 | 18081 | 19644 | 18083 |
| console-enterprise | 3100 | 19192 | 18181 | 19744 | 18183 |
| console-custom1 | 3200 | 19292 | 18281 | 19844 | 18283 |

**Formula:** `port = basePort + (variantIndex × 100)`

This prevents conflicts and allows running up to 600+ variants simultaneously.

### Creating a New Variant

Step-by-step guide to create a new test variant:

**1. Scaffold the variant:**
```bash
bun run variant:create console-qa
```

This creates:
- `tests/console-qa/` - Test directory
- `tests/config/console.qa.config.yaml` - Backend config (copied from OSS template)
- `playwright.qa.config.ts` - Playwright config
- `tests/console-qa/smoke.spec.ts` - Sample test

**2. Add to variant registry:**

Edit `tests/variants.config.mjs` and add your variant:

```javascript
'console-qa': {
  name: 'console-qa',
  displayName: 'QA',
  configFile: 'console.qa.config.yaml',
  testDir: 'console-qa',
  metadata: {
    isEnterprise: false,  // Change to true if enterprise features needed
    needsShadowlink: false  // Change to true if shadowlink needed
  },
  ports: {
    backend: 3200,
    redpandaKafka: 19292,
    redpandaSchemaRegistry: 18281,
    redpandaAdmin: 19844,
    kafkaConnect: 18283
  }
}
```

**3. Add package.json script:**

```json
{
  "scripts": {
    "e2e-test-qa": "playwright test tests/console-qa/ -c playwright.qa.config.ts"
  }
}
```

**4. Customize configuration:**

Edit `tests/config/console.qa.config.yaml` to customize backend settings:
- Feature flags
- Authentication settings
- Cluster connections
- Service endpoints

**5. Write your tests:**

Add test files in `tests/console-qa/`:

```typescript
// tests/console-qa/my-feature.spec.ts
import { test, expect } from '@playwright/test';

test('QA environment smoke test', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Redpanda Console/);
});
```

**6. Run your tests:**

```bash
bun run e2e-test-qa
```

### Variant CLI Commands

```bash
# List all variants with details
bun run variant:list

# Create a new variant
bun run variant:create console-staging

# Validate configuration
bun run variant:validate

# Run variant tests
bun run variant run console-qa
```

### Validation

Validate your variant configuration:

```bash
bun run variant:validate
```

This checks for:
- ✅ Port conflicts between variants
- ✅ Missing test directories
- ✅ Unconfigured test directories
- ✅ Missing configuration files
- ✅ Invalid variant definitions

### Variant Architecture

```
tests/
├── variants.config.mjs           # Single source of truth for all variants
├── playwright-config-factory.mjs # Generates variant-specific configs
├── variant-cli.mjs               # Management CLI
├── global-setup.mjs              # Variant-aware container setup
├── global-teardown.mjs           # Variant-aware cleanup
├── config/
│   ├── console.config.yaml       # OSS config
│   ├── console.enterprise.config.yaml  # Enterprise config
│   ├── console.qa.config.yaml    # Custom variant config
│   └── Dockerfile.backend        # Backend container image
├── console/                      # OSS tests
│   ├── topics/
│   └── connectors/
├── console-enterprise/           # Enterprise tests
│   ├── users.spec.ts
│   ├── acl.spec.ts
│   └── shadowlink/
└── console-qa/                   # Custom variant tests
    └── smoke.spec.ts
```

### Container State Files

Each variant maintains its own container state file:
- `.testcontainers-state-console.json`
- `.testcontainers-state-console-enterprise.json`
- `.testcontainers-state-console-qa.json`

This allows independent lifecycle management per variant.

### Troubleshooting Variants

**Port Already in Use:**
```bash
# Check what's using a port
lsof -i :3100

# Stop all test containers
docker ps | grep -E "redpanda|console-backend|owlshop|connect" | awk '{print $1}' | xargs docker stop
```

**Variant Not Found:**
```bash
# Check available variants
bun run variant:list

# Validate configuration
bun run variant:validate
```

**Configuration Issues:**
```bash
# Run validation to diagnose
bun run variant:validate

# Check variant registry
cat tests/variants.config.mjs
```

**Stale Container State:**
```bash
# Remove state files to force cleanup
rm tests/.testcontainers-state-*.json

# Restart Docker
docker restart
```

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
