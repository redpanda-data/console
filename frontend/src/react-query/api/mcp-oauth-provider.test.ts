/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, test } from 'vitest';

import { ConsoleJWTOAuthProvider } from './mcp-oauth-provider';

const INTERACTIVE_AUTHORIZATION_ERROR = /interactive authorization/;
const PKCE_ERROR = /PKCE/;

describe('ConsoleJWTOAuthProvider', () => {
  test('returns the current JWT as a Bearer token every call', () => {
    let jwt: string | undefined = 'jwt-1';
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => jwt });

    expect(provider.tokens()).toEqual({ access_token: 'jwt-1', token_type: 'Bearer' });

    jwt = 'jwt-2';
    expect(provider.tokens()).toEqual({ access_token: 'jwt-2', token_type: 'Bearer' });
  });

  test('returns undefined when no JWT is present', () => {
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => undefined });
    expect(provider.tokens()).toBeUndefined();
  });

  test('exposes static client metadata with JWT-bearer grant', () => {
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => 'x', clientName: 'custom-client' });

    expect(provider.redirectUrl).toBeUndefined();
    expect(provider.clientMetadata.client_name).toBe('custom-client');
    expect(provider.clientMetadata.grant_types).toEqual(['urn:ietf:params:oauth:grant-type:jwt-bearer']);
    expect(provider.clientInformation()).toEqual({ client_id: 'custom-client' });
  });

  test('defaults clientName to redpanda-console when omitted', () => {
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => 'x' });

    expect(provider.clientMetadata.client_name).toBe('redpanda-console');
    expect(provider.clientInformation()).toEqual({ client_id: 'redpanda-console' });
  });

  test('clientMetadata advertises no redirect URIs and public-client auth method', () => {
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => 'x' });

    expect(provider.clientMetadata.redirect_uris).toEqual([]);
    expect(provider.clientMetadata.token_endpoint_auth_method).toBe('none');
  });

  test('saveTokens is a no-op', () => {
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => 'x' });
    expect(() => provider.saveTokens()).not.toThrow();
  });

  test('interactive flow methods throw because the console never drives OAuth redirects', () => {
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => 'x' });

    expect(() => provider.redirectToAuthorization()).toThrow(INTERACTIVE_AUTHORIZATION_ERROR);
    expect(() => provider.saveCodeVerifier()).toThrow(PKCE_ERROR);
    expect(() => provider.codeVerifier()).toThrow(PKCE_ERROR);
  });
});
