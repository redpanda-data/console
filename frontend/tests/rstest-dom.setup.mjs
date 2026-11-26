// Copyright 2026 Redpanda Data, Inc.

// Rstest has no custom environment hook. Use the native registration entry so
// the bundled Testing Library aliases share the installed DOM.
const { register } = await import(/* webpackIgnore: true */ '@ctrl/dom/register/pure');
const { fetch, Request, Response, Headers, MessageChannel, MessagePort } = globalThis;
register({ url: 'http://localhost:3000/', compat: 'modern' });
Object.assign(globalThis, { fetch, Request, Response, Headers, MessageChannel, MessagePort });
