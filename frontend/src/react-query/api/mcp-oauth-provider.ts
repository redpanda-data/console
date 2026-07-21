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

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

export type ConsoleJWTOAuthProviderOptions = {
  getJwt: () => string | undefined;
  clientName?: string;
};

const JWT_SEGMENT_COUNT = 3;

/**
 * Best-effort check that a JWT has not yet expired.
 *
 * Decodes the middle segment (base64url) and reads `exp`. Returns `true` only
 * when we can confirm expiry; returns `false` on any parse failure, missing
 * `exp`, or non-numeric `exp` so a well-formed token is never spuriously
 * rejected. This is advisory, not cryptographic — signature validation still
 * lives with the server.
 */
const isJwtExpired = (token: string): boolean => {
  try {
    const parts = token.split('.');
    if (parts.length !== JWT_SEGMENT_COUNT) {
      return false;
    }
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    if (typeof payload.exp !== 'number') {
      return false;
    }
    return payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
};

/**
 * OAuthClientProvider wrapper around the console's existing JWT.
 *
 * Console authenticates via an externally managed JWT held on the shared
 * `config` object. This provider lets the MCP SDK plug into that flow:
 * - `tokens()` returns the current JWT as an OAuth bearer token on every
 *   call, so the SDK always sees a fresh value without needing refresh.
 * - Flow-dependent methods (PKCE, redirects, client registration) throw,
 *   because the console never drives an interactive OAuth flow — the
 *   caller has either already authenticated, or it hasn't.
 */
export class ConsoleJWTOAuthProvider implements OAuthClientProvider {
  private readonly getJwt: () => string | undefined;
  private readonly clientName: string;

  constructor({ getJwt, clientName = 'redpanda-console' }: ConsoleJWTOAuthProviderOptions) {
    this.getJwt = getJwt;
    this.clientName = clientName;
  }

  readonly redirectUrl: string | URL | undefined;

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this.clientName,
      redirect_uris: [],
      grant_types: ['urn:ietf:params:oauth:grant-type:jwt-bearer'],
      token_endpoint_auth_method: 'none',
    };
  }

  clientInformation(): OAuthClientInformation | undefined {
    return { client_id: this.clientName };
  }

  tokens(): OAuthTokens | undefined {
    const jwt = this.getJwt();
    if (!jwt) {
      return;
    }
    if (isJwtExpired(jwt)) {
      return;
    }
    return {
      access_token: jwt,
      token_type: 'Bearer',
    };
  }

  saveTokens(): void {
    // Tokens are owned by the console auth layer, not this provider.
  }

  redirectToAuthorization(): void {
    throw new Error('ConsoleJWTOAuthProvider does not drive interactive authorization flows');
  }

  saveCodeVerifier(): void {
    throw new Error('ConsoleJWTOAuthProvider does not use PKCE');
  }

  codeVerifier(): string {
    throw new Error('ConsoleJWTOAuthProvider does not use PKCE');
  }
}
