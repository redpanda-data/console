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

const base64Url = (value: string): string =>
  btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const makeJwt = (payload: Record<string, unknown>): string => {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  // Signature is opaque to the provider — we only decode the payload.
  return `${header}.${body}.sig`;
};

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

  test('returns undefined when the JWT exp has passed so SDK raises UnauthorizedError early', () => {
    const expiredJwt = makeJwt({ exp: Math.floor(Date.now() / 1000) - 60 });
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => expiredJwt });

    expect(provider.tokens()).toBeUndefined();
  });

  test('returns the JWT when exp is in the future', () => {
    const freshJwt = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => freshJwt });

    expect(provider.tokens()).toEqual({ access_token: freshJwt, token_type: 'Bearer' });
  });

  test('returns the JWT when exp is absent — decode is advisory, not crypto', () => {
    const noExpJwt = makeJwt({ sub: 'user' });
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => noExpJwt });

    expect(provider.tokens()).toEqual({ access_token: noExpJwt, token_type: 'Bearer' });
  });

  test('returns the JWT when the token is malformed — fail-open, not fail-closed', () => {
    const malformed = 'this-is-not-a-valid-jwt';
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => malformed });

    expect(provider.tokens()).toEqual({ access_token: malformed, token_type: 'Bearer' });
  });

  test('returns the JWT when the middle segment is unparseable JSON', () => {
    const jwt = `${base64Url('{"alg":"HS256"}')}.${base64Url('not-json')}.sig`;
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => jwt });

    expect(provider.tokens()).toEqual({ access_token: jwt, token_type: 'Bearer' });
  });

  test('returns the JWT when exp is non-numeric', () => {
    const jwt = makeJwt({ exp: 'not-a-number' });
    const provider = new ConsoleJWTOAuthProvider({ getJwt: () => jwt });

    expect(provider.tokens()).toEqual({ access_token: jwt, token_type: 'Bearer' });
  });
});

describe('ConsoleJWTOAuthProvider — instance isolation', () => {
  test('two providers share no mutable state — their getJwt sources are independent', () => {
    let jwtA = 'jwt-A';
    let jwtB = 'jwt-B';
    const providerA = new ConsoleJWTOAuthProvider({ getJwt: () => jwtA });
    const providerB = new ConsoleJWTOAuthProvider({ getJwt: () => jwtB });

    expect(providerA.tokens()).toEqual({ access_token: 'jwt-A', token_type: 'Bearer' });
    expect(providerB.tokens()).toEqual({ access_token: 'jwt-B', token_type: 'Bearer' });

    jwtA = 'jwt-A-rotated';
    jwtB = undefined as unknown as string;

    expect(providerA.tokens()).toEqual({ access_token: 'jwt-A-rotated', token_type: 'Bearer' });
    expect(providerB.tokens()).toBeUndefined();
  });
});
