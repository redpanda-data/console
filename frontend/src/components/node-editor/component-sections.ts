import { schemaLoader } from '@/components/node-editor/redpanda-connect/schema-loader';
import type { SchemaNodeConfig } from '@/components/node-editor/redpanda-connect/schema-loader';
import { getCategoryIcon } from './command-palette';

export interface ComponentSection {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  configs: SchemaNodeConfig[];
}

export const getComponentSections = (
  applyFilters?: (configs: SchemaNodeConfig[]) => SchemaNodeConfig[],
): ComponentSection[] => {
  const filterFn = applyFilters || ((configs: SchemaNodeConfig[]) => configs);

  return [
    {
      title: 'Inputs',
      icon: getCategoryIcon('input'),
      configs: filterFn(schemaLoader.getNodeConfigsByCategory('input')),
    },
    {
      title: 'Processors',
      icon: getCategoryIcon('processor'),
      configs: filterFn(schemaLoader.getNodeConfigsByCategory('processor')),
    },
    {
      title: 'Outputs',
      icon: getCategoryIcon('output'),
      configs: filterFn(schemaLoader.getNodeConfigsByCategory('output')),
    },
    {
      title: 'Caches',
      icon: getCategoryIcon('cache'),
      configs: filterFn(schemaLoader.getNodeConfigsByCategory('cache')),
    },
    {
      title: 'Buffers',
      icon: getCategoryIcon('buffer'),
      configs: filterFn(schemaLoader.getNodeConfigsByCategory('buffer')),
    },
    {
      title: 'Rate Limits',
      icon: getCategoryIcon('rate_limit'),
      configs: filterFn(schemaLoader.getNodeConfigsByCategory('rate_limit')),
    },
    {
      title: 'Scanners',
      icon: getCategoryIcon('scanner'),
      configs: filterFn(schemaLoader.getNodeConfigsByCategory('scanner')),
    },
  ];
};
