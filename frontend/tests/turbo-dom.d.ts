// Copyright 2026 Redpanda Data, Inc.

// The package does not declare its /install subpath.
declare module '@miaskiewicz/turbo-dom/install' {
  export function installGlobals(
    target: typeof globalThis,
    options?: { html?: string; url?: string }
  ): { teardown: () => void };
}
