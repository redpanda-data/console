#!/bin/bash
set -e

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting testcontainers environment...${NC}"

# Run the global setup
node -e "import('./tests/global-setup.mjs').then(m => m.default()).catch(err => { console.error(err); process.exit(1); })"

echo -e "${GREEN}Running Playwright tests...${NC}"

# Run playwright tests with all arguments passed through
playwright test "$@"

# Store the exit code
TEST_EXIT_CODE=$?

# Cleanup is handled by globalTeardown in playwright.config.ts

exit $TEST_EXIT_CODE
