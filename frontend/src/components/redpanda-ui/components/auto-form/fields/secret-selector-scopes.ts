type Scope = number;

const SCOPE_MAP: Record<string, Scope> = {
  // Keep in sync with redpanda/api/dataplane/v1/secret.proto SCOPE_* numeric values.
  REDPANDA_CONNECT: 1,
  REDPANDA_CLUSTER: 2,
};

export function resolveSecretScopes(scopeString: string | undefined): readonly unknown[] {
  if (!scopeString) {
    return [];
  }
  const scope = SCOPE_MAP[scopeString];
  return scope !== undefined ? [scope] : [];
}
