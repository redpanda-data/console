const REDPANDA_AI_URL = 'https://ai.redpanda.com';

const LEGACY_AI_DESTINATIONS = {
  agents: '/agents',
  knowledgebases: '/home',
  'mcp-servers': '/mcp-servers',
  transcripts: '/home',
} as const;

type LegacyAiRoute = keyof typeof LEGACY_AI_DESTINATIONS;

const isLegacyAiRoute = (route: string): route is LegacyAiRoute => Object.hasOwn(LEGACY_AI_DESTINATIONS, route);

export function getLegacyAiDestination(pathname: string, clusterId?: string): string | undefined {
  const route = pathname.split('/')[1];
  if (!(route && isLegacyAiRoute(route))) {
    return;
  }

  const destination = new URL(LEGACY_AI_DESTINATIONS[route], REDPANDA_AI_URL);
  if (clusterId && clusterId !== 'default') {
    destination.searchParams.set('adpEnvironmentId', clusterId);
  }

  return destination.toString();
}
