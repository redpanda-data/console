// Copyright 2026 Redpanda Data, Inc.

// Rstest has no custom environment hook. Load Turbo DOM natively so its
// parser can resolve the platform addon or WASM relative to its package.
const { installGlobals } = await import(/* webpackIgnore: true */ '@miaskiewicz/turbo-dom/install');
const { atob, btoa, fetch, MessageChannel, MessagePort } = globalThis;
installGlobals(globalThis, { url: 'http://localhost:3000/' });
// Keep Node's host APIs: Turbo DOM delegates fetch and base64 back to
// globalThis, and its timer-based MessageChannel can deadlock React's async act.
Object.assign(globalThis, { atob, btoa, fetch, MessageChannel, MessagePort });
