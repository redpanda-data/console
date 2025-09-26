# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
- `bun start` - Start development server with hot reload (port 3000)
- `bun run build` - Build production bundle to `build/` directory
- `bun preview` - Preview production build locally

### Testing
- `bun test` - Run Vitest unit/integration tests in watch mode
- `bun run test:coverage` - Run tests with coverage report
- `bun run test:ui` - Run tests with interactive UI
- `bun run e2e-test` - Run Playwright E2E UI tests for console
- `bun run e2e-test-enterprise` - Run Playwright E2E UI tests for enterprise features
- `bun run e2e-test:ui` - Run E2E tests with Playwright UI

### Code Quality
- `bun run lint` - Run Biome linter and auto-fix issues
- `bun run lint:check` - Check linting without auto-fix
- `bun run format` - Format code with Biome
- `bun run format:check` - Check code formatting without changes
- `bun run type:check` - Run TypeScript type checking (no emit)

## Architecture Overview

This is a React 18 frontend application for the Redpanda Console, built with modern tooling and following enterprise patterns.

### Tech Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Rsbuild (Rspack-based bundler)
- **State Management**:
  - **Modern (preferred)**: Connect React Query (TanStack Query) for server state, Zustand for client state
  - **Legacy**: MobX (being phased out)
- **UI Components**:
  - **Modern (preferred)**: Tailwind CSS v4 + UI registry powered by shadcn Redpanda design system
  - **Legacy**: Chakra UI with `@redpanda-data/ui` npm package (old, being phased out)
- **RPC Communication**: Connect-RPC with Protocol Buffers
- **Testing**:
  - Vitest for unit and integration tests
  - Playwright for E2E UI tests
- **Code Quality**: Biome for linting/formatting, TypeScript for type safety

### Project Structure
- `src/` - Application source code
  - `components/` - React components organized by feature
    - `pages/` - Page-level components for routing
    - `misc/` - Shared utility components
    - `form/` - Form-related components
    - `layout/` - Layout components (sidebar, content)
    - `redpanda-ui/` - Custom UI component extensions
  - `hooks/` - Custom React hooks
  - `state/` - MobX stores for global state management
  - `utils/` - Utility functions and helpers
  - `protogen/` - Generated Protocol Buffer code
  - `react-query/` - React Query hooks and configurations
  - `assets/` - Static assets (images, fonts, styles)
  - `App.tsx` - Main application component
  - `routes.tsx` - Application routing configuration

### Key Architectural Patterns

1. **Connect-RPC Integration**: The app uses Connect-RPC for type-safe API communication with the backend. Protocol Buffer definitions are compiled to TypeScript via `@bufbuild/protoc-gen-es`.

2. **Module Federation**: Configured for micro-frontend architecture, allowing remote module loading and sharing across applications.

3. **State Management**:
   - **Modern approach**: Use Connect React Query (TanStack Query) for server state and Zustand for client state
   - **Legacy code**: MobX stores exist for UI state but should not be used in new code

4. **Environment Configuration**: Uses `REACT_APP_*` prefixed environment variables for runtime configuration. Key variables are loaded via Rsbuild's `loadEnv`.

5. **Styling Strategy**:
   - **Modern approach**: Tailwind CSS v4 with shadcn-powered UI registry components
   - **Legacy code**: Chakra UI theme system via `@redpanda-data/ui` package (avoid in new code)
   - SCSS modules for component-specific styles (legacy)

6. **Authentication**: Token-based auth with bearer token interceptors on gRPC transport.

### Important Configuration Files
- `rsbuild.config.ts` - Build configuration with plugins for React, SASS, YAML, and Monaco Editor
- `tsconfig.base.json` - TypeScript configuration with strict mode, path mappings to `src/`
- `biome.jsonc` - Code formatting and linting rules
- `vitest.config.mts` - Test configuration with jsdom environment
- `module-federation.js` - Module federation setup for micro-frontends

### Development Notes
- The app supports both standalone and embedded modes (controlled via `isEmbedded` check)
- Monaco Editor is integrated for YAML/JSON editing with custom language support
- Builder.io integration for dynamic content management
- Feature flags are managed through `CustomFeatureFlagProvider`
- Development server proxies API calls to `http://localhost:9090`