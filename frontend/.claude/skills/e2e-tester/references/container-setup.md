# Container Setup Reference

## Test Container Lifecycle

```
Setup (global-setup.mjs):
1. Build frontend (frontend/build/)
2. Copy frontend assets to backend/pkg/embed/frontend/
3. Build backend Docker image with testcontainers
4. Start Redpanda container with SASL auth
5. Start backend container serving frontend
6. Wait for services to be ready

Tests run...

Teardown (global-teardown.mjs):
1. Stop backend container
2. Stop Redpanda container
3. Remove Docker network
4. Clean up copied frontend assets
```

## Network Setup

- All containers on shared Docker network
- Internal addresses: `redpanda:9092`, `console-backend:3000`
- External access: `localhost:19092`, `localhost:3000`

## Frontend Asset Copy (Required)

The backend Docker image needs frontend assets embedded at build time:

```typescript
// In global-setup.mjs
async function buildBackendImage(isEnterprise) {
  // Copy frontend build to backend embed directory
  const frontendBuildDir = resolve(__dirname, '../build');
  const embedDir = join(backendDir, 'pkg/embed/frontend');
  await execAsync(`cp -r "${frontendBuildDir}"/* "${embedDir}"/`);

  // Build Docker image using testcontainers
  // Docker doesn't allow referencing files outside build context,
  // so we temporarily copy the Dockerfile into the build context
  const tempDockerfile = join(backendDir, '.dockerfile.e2e.tmp');
  await execAsync(`cp "${dockerfilePath}" "${tempDockerfile}"`);

  try {
    await GenericContainer
      .fromDockerfile(backendDir, '.dockerfile.e2e.tmp')
      .build(imageTag, { deleteOnExit: false });
  } finally {
    await execAsync(`rm -f "${tempDockerfile}"`).catch(() => {});
    await execAsync(`find "${embedDir}" -mindepth 1 ! -name '.gitignore' -delete`).catch(() => {});
  }
}
```

## Container Configuration

**Backend container:**
```typescript
const backend = await new GenericContainer(imageTag)
  .withNetwork(network)
  .withNetworkAliases('console-backend')
  .withExposedPorts({ container: 3000, host: 3000 })
  .withBindMounts([{
    source: configPath,
    target: '/etc/console/config.yaml'
  }])
  .withCommand(['--config.filepath=/etc/console/config.yaml'])
  .start();
```

**Redpanda container:**
```typescript
const redpanda = await new GenericContainer('redpandadata/redpanda:v25.2.1')
  .withNetwork(network)
  .withNetworkAliases('redpanda')
  .withExposedPorts(
    { container: 19_092, host: 19_092 },  // Kafka
    { container: 18_081, host: 18_081 },  // Schema Registry
    { container: 9644, host: 19_644 }     // Admin API
  )
  .withEnvironment({ RP_BOOTSTRAP_USER: 'e2euser:very-secret' })
  .withHealthCheck({
    test: ['CMD-SHELL', "rpk cluster health | grep -E 'Healthy:.+true' || exit 1"],
    interval: 15_000,
    retries: 5
  })
  .withWaitStrategy(Wait.forHealthCheck())
  .start();
```

## Authentication

**OSS Mode:** No authentication required

**Enterprise Mode:** Basic auth with `e2euser:very-secret`

```typescript
test.use({
  httpCredentials: {
    username: 'e2euser',
    password: 'very-secret',
  },
});
```

## CI Integration (GitHub Actions)

```yaml
e2e-test:
  runs-on: ubuntu-latest-8
  steps:
    - uses: actions/checkout@v5
    - uses: oven-sh/setup-bun@v2

    - name: Install dependencies
      run: bun install --frozen-lockfile

    - name: Build frontend
      run: |
        REACT_APP_CONSOLE_GIT_SHA=$(echo $GITHUB_SHA | cut -c 1-6)
        bun run build

    - name: Install Playwright browsers
      run: bun run install:chromium

    - name: Run E2E tests
      run: bun run e2e-test

    - name: Upload test report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: frontend/playwright-report/
```

## Troubleshooting

### Container Fails to Start

```bash
# Check if frontend build exists
ls frontend/build/

# Check if Docker image built successfully
docker images | grep console-backend

# Check container logs
docker logs <container-id>

# Verify Docker network
docker network ls | grep testcontainers
```

### Port Already in Use

```bash
# Find and kill process using port 3000
lsof -ti:3000 | xargs kill -9
```
