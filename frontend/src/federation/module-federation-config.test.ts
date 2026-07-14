/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, test } from 'vitest';

import { moduleFederationConfig } from '../../module-federation.config';

describe('Console Module Federation config', () => {
  test('keeps the federation name and embedded.js filename for Cloud UI', () => {
    expect(moduleFederationConfig.name).toBe('rp_console');
    expect(moduleFederationConfig.filename).toBe('embedded.js');
  });

  test('routes ./App to the React 18-safe legacy compatibility shim', () => {
    expect(moduleFederationConfig.exposes).toMatchObject({
      './App': './src/federation/console-legacy-app.tsx',
    });
  });

  test('exposes the React 19 bridge entry consumed by new Cloud UI hosts', () => {
    expect(moduleFederationConfig.exposes).toMatchObject({
      './BridgeApp': './src/federation/console-federated-bridge.tsx',
    });
  });

  test('keeps the ./types contract expose', () => {
    expect(moduleFederationConfig.exposes).toMatchObject({
      './types': './src/federation/types.ts',
    });
  });

  test('shares nothing so the bridge can isolate React 19 from the React 18 host', () => {
    const shared = moduleFederationConfig.shared ?? {};
    const sharedNames = Array.isArray(shared) ? shared : Object.keys(shared);
    expect(sharedNames).toHaveLength(0);
    expect(sharedNames).not.toContain('react');
    expect(sharedNames).not.toContain('react-dom');
    expect(sharedNames).not.toContain('@tanstack/react-query');
    expect(sharedNames).not.toContain('@tanstack/react-router');
  });
});
