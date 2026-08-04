import { resolveSecretScopes } from './secret-selector-scopes';

describe('resolveSecretScopes', () => {
  it.each([
    ['REDPANDA_CONNECT', 1],
    ['REDPANDA_CLUSTER', 2],
    ['MCP_SERVER', 3],
    ['AI_AGENT', 4],
    ['AI_GATEWAY', 5],
  ])('maps the %s proto scope to %i', (scopeName, scopeValue) => {
    expect(resolveSecretScopes(scopeName)).toEqual([scopeValue]);
  });
});
