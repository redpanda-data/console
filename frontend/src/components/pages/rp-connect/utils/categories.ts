import type { ConnectComponentSpec, ConnectNodeCategory, ExtendedConnectComponentSpec } from '../types/schema';

const displayNames: Record<string, string> = {
  // Component types
  input: 'Inputs',
  output: 'Outputs',
  processor: 'Processors',
  cache: 'Caches',
  buffer: 'Buffers',
  rate_limit: 'Rate Limits',
  scanner: 'Scanners',
  metrics: 'Metrics',
  tracer: 'Tracers',
  // Semantic categories
  databases: 'Databases',
  messaging: 'Message Queues',
  storage: 'File Storage',
  api: 'API Clients',
  aws: 'AWS Services',
  gcp: 'Google Cloud',
  azure: 'Azure Services',
  cloud: 'Cloud Services',
  export: 'Data Export',
  transformation: 'Data Transformation',
  monitoring: 'Monitoring & Observability',
  // Additional categories
  windowing: 'Windowing',
  utility: 'Utility',
  local: 'Local',
  social: 'Social',
  network: 'Network',
  integration: 'Integration',
  spicedb: 'SpiceDB',
  ai: 'AI/ML',
  parsing: 'Parsing',
  mapping: 'Mapping',
  composition: 'Composition',
  unstructured: 'Unstructured',
};

export const getCategoryDisplayName = (category: string): string =>
  displayNames[category] || category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');

export const getAllCategories = (
  components: (ConnectComponentSpec | ExtendedConnectComponentSpec)[]
): ConnectNodeCategory[] => {
  const categorySet = new Set<string>();

  // Collect categories from built-in components
  for (const component of components) {
    if (component.categories) {
      for (const categoryId of component.categories) {
        categorySet.add(categoryId);
      }
    }
  }

  // Convert to ConnectNodeCategory array with display names
  return Array.from(categorySet)
    .sort((a, b) => a.localeCompare(b))
    .map((categoryId) => ({
      id: categoryId,
      name: getCategoryDisplayName(categoryId),
    }));
};
