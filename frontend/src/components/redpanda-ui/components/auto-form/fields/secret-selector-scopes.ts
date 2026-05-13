type Scope = number;

const SCOPE_MAP: Record<string, Scope> = {
  // Keep these in sync with the dataplane `Scope` enum numeric values:
  // redpanda/api/dataplane/v1/secret.proto — SCOPE_* values.
  REDPANDA_CONNECT: 1,
  REDPANDA_CLUSTER: 2,
  MCP_SERVER: 3,
  AI_AGENT: 4,
  AI_GATEWAY: 5,
};

export function resolveSecretScopes(scopeString: string | undefined): readonly unknown[] {
  if (!scopeString) {
    return [];
  }
  const scope = SCOPE_MAP[scopeString];
  return scope !== undefined ? [scope] : [];
}
