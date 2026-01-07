# E2E Dev Mode


Dev mode allows you to run E2E tests with a locally running frontend dev server, enabling hot-reloading and faster iteration when developing UI changes.

## How It Works

**Normal Mode:**
- Backend container serves both API and frontend (port 3000)
- Requires `bun run build` before running tests
- Changes require rebuild and container restart

**Dev Mode:**
- Backend container serves only API (port 9090)
- Frontend dev server runs separately (port 3000)
- Hot-reloading enabled for frontend changes
- No rebuild needed for FE changes

## Usage

### 1. Start E2E tests in dev mode

```bash
bun run e2e-test:dev
```

This will:
- Start testcontainers (Redpanda, OwlShop, etc.)
- Build and start backend on port 9090
- Wait for you to start the frontend dev server

### 2. Start frontend dev server

In a separate terminal:

```bash
bun start
```

The dev server will:
- Start on port 3000
- Proxy API calls to backend at `localhost:9090`
- Enable hot-reloading for frontend changes

### 3. Run tests

The Playwright UI will be ready to run tests against `http://localhost:3000`.

## Workflow

```bash
# Terminal 1: Start E2E tests in dev mode
bun run e2e-test:dev

# Terminal 2: Start FE dev server
bun start

# Now you can:
# - Run tests in Playwright UI
# - Edit frontend code
# - See changes immediately (hot reload)
# - Re-run tests without rebuilding
```

## Enterprise Mode

For enterprise tests:

```bash
# Terminal 1
bun run e2e-test-enterprise:dev

# Terminal 2
bun start
```

## Clean Up

When done:
1. Stop the FE dev server (Ctrl+C)
2. Close Playwright UI
3. Testcontainers will be cleaned up automatically

## Troubleshooting

**Backend not accessible:**
- Check backend is running on port 9090: `curl http://localhost:9090/api/cluster/config`
- Check testcontainers state file: `tests/.testcontainers-state.json`

**Frontend not proxying:**
- Verify `package.json` has `"proxy": "http://localhost:9090"`
- Restart FE dev server

**Port conflicts:**
- Backend uses: 9090 (dev mode) or 3000 (normal mode)
- Frontend uses: 3000
- Redpanda uses: 19092, 18081, 18082, 19644
