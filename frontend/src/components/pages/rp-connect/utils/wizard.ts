/** Matches 'topic' (outputs/cache) or 'topics' (inputs). */
export const isTopicField = (fieldName: string): boolean => {
  const normalizedName = fieldName.toLowerCase();
  return normalizedName === 'topic' || normalizedName === 'topics';
};

/** Matches 'user' (kafka sasl) or 'username' (redpanda sasl). */
export const isUserField = (fieldName: string): boolean => {
  const normalized = fieldName.toLowerCase();
  return normalized === 'user' || normalized === 'username';
};

export const isPasswordField = (fieldName: string): boolean => fieldName.toLowerCase() === 'password';

export const isConsumerGroupField = (fieldName: string): boolean => fieldName.toLowerCase() === 'consumer_group';

/** True for schema_registry.url, which should use REDPANDA_SCHEMA_REGISTRY_URL. */
export const isSchemaRegistryUrlField = (fieldName: string, parentName?: string): boolean => {
  const isUrl = fieldName.toLowerCase() === 'url';
  const parentIsSchemaRegistry = parentName?.toLowerCase() === 'schema_registry';
  return isUrl && !!parentIsSchemaRegistry;
};
