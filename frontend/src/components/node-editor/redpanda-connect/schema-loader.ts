import benthosSchema from './assets/rp-connect-schema.json';
import type { ComponentSpec, PipelineRoot } from './types';

export interface NodeCategory {
  id: string;
  name: string;
  components: ComponentSpec[];
}

export interface SchemaNodeConfig {
  id: string;
  name: string;
  type: string;
  category: 'input' | 'output' | 'processor' | 'cache' | 'buffer' | 'rate_limit' | 'scanner';
  status: string;
  summary?: string;
  description?: string;
  config: ComponentSpec['config'];
  categories?: string[] | null;
  version?: string;
}

/**
 * Loads and parses the Redpanda Connect schema to extract component information
 */
export class SchemaLoader {
  private schema: PipelineRoot;
  private nodeConfigs: Map<string, SchemaNodeConfig> = new Map();
  private categories: Map<string, NodeCategory> = new Map();

  constructor() {
    this.schema = benthosSchema as PipelineRoot;
    this.parseSchema();
  }

  private parseSchema(): void {
    // Parse each component type from the schema
    const componentTypes = [
      { key: 'inputs', category: 'input' as const },
      { key: 'outputs', category: 'output' as const },
      { key: 'processors', category: 'processor' as const },
      { key: 'caches', category: 'cache' as const },
      { key: 'buffers', category: 'buffer' as const },
      { key: 'rate-limits', category: 'rate_limit' as const },
      { key: 'scanners', category: 'scanner' as const },
    ];

    for (const { key, category } of componentTypes) {
      const components = this.schema[key as keyof PipelineRoot] as ComponentSpec[] | undefined;
      if (components) {
        const categoryData: NodeCategory = {
          id: category,
          name: this.getCategoryDisplayName(category),
          components: components,
        };
        this.categories.set(category, categoryData);

        // Create node configs for each component
        for (const component of components) {
          const nodeConfig: SchemaNodeConfig = {
            id: `${category}-${component.name}`,
            name: component.name,
            type: component.type,
            category,
            status: component.status,
            summary: component.summary,
            description: component.description,
            config: component.config,
            categories: component.categories,
            version: component.version,
          };
          this.nodeConfigs.set(nodeConfig.id, nodeConfig);
        }
      }
    }
  }

  private getCategoryDisplayName(category: string): string {
    const displayNames: Record<string, string> = {
      input: 'Inputs',
      output: 'Outputs',
      processor: 'Processors',
      cache: 'Caches',
      buffer: 'Buffers',
      rate_limit: 'Rate Limits',
      scanner: 'Scanners',
    };
    return displayNames[category] || category;
  }

  /**
   * Get all available node categories
   */
  getCategories(): NodeCategory[] {
    return Array.from(this.categories.values());
  }

  /**
   * Get all node configurations
   */
  getAllNodeConfigs(): SchemaNodeConfig[] {
    return Array.from(this.nodeConfigs.values());
  }

  /**
   * Get node configurations by category
   */
  getNodeConfigsByCategory(category: string): SchemaNodeConfig[] {
    return this.getAllNodeConfigs().filter((config) => config.category === category);
  }

  /**
   * Get a specific node configuration by ID
   */
  getNodeConfig(id: string): SchemaNodeConfig | undefined {
    return this.nodeConfigs.get(id);
  }

  /**
   * Search node configurations by name or description
   */
  searchNodeConfigs(query: string): SchemaNodeConfig[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllNodeConfigs().filter(
      (config) =>
        config.name.toLowerCase().includes(lowerQuery) ||
        config.summary?.toLowerCase().includes(lowerQuery) ||
        config.description?.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * Get nodes filtered by status (stable, beta, experimental, deprecated)
   */
  getNodeConfigsByStatus(status: string): SchemaNodeConfig[] {
    return this.getAllNodeConfigs().filter((config) => config.status === status);
  }

  /**
   * Get the schema version
   */
  getSchemaVersion(): string {
    return this.schema.version;
  }

  /**
   * Get input components specifically (for backward compatibility)
   */
  getInputs(): ComponentSpec[] {
    return this.schema.inputs || [];
  }

  /**
   * Get output components specifically (for backward compatibility)
   */
  getOutputs(): ComponentSpec[] {
    return this.schema.outputs || [];
  }
}

// Export a singleton instance
export const schemaLoader = new SchemaLoader();
