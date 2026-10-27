import {
  getOperationsForResourceType,
  ModeAllowAll,
  ModeCustom,
  ModeDenyAll,
  type ModeType,
  type OperationType,
  OperationTypeAllow,
  OperationTypeDeny,
  OperationTypeNotSet,
  ResourcePatternTypeAny,
  type ResourceType,
  ResourceTypeCluster,
  ResourceTypeConsumerGroup,
  ResourceTypeSchemaRegistry,
  ResourceTypeSubject,
  ResourceTypeTopic,
  ResourceTypeTransactionalId,
  type Rule,
  type SharedConfig,
} from '../shared/acl-model';

const SCHEMA_REGISTRY_DISABLED_TEXT = 'Schema Registry is not enabled.';

export const createRule = (id: number, resourceType: ResourceType): Rule => ({
  id,
  resourceType,
  mode: ModeCustom,
  selectorType: ResourcePatternTypeAny,
  selectorValue: '',
  operations: { ...getOperationsForResourceType(resourceType) },
});

export const getInitialRules = (rules?: Rule[]): Rule[] => rules ?? [createRule(1, ResourceTypeCluster)];

export const getInitialSharedConfig = (sharedConfig?: Partial<SharedConfig>, principalType?: string): SharedConfig => ({
  principal: sharedConfig?.principal ?? (principalType ? `${principalType}` : 'User:'),
  host: sharedConfig?.host ?? '*',
});

const hasRuleOfType = (rules: Rule[], resourceType: ResourceType) =>
  rules.some((rule) => rule.resourceType === resourceType);

// Only one cluster rule may exist, so later rules default to topics.
export const getNextRuleResourceType = (rules: Rule[]): ResourceType =>
  hasRuleOfType(rules, ResourceTypeCluster) ? ResourceTypeTopic : ResourceTypeCluster;

export const createAllowAllRules = (schemaRegistryEnabled: boolean, firstId: number): Rule[] => {
  const resourceTypes = [
    ResourceTypeCluster,
    ResourceTypeTopic,
    ResourceTypeConsumerGroup,
    ResourceTypeTransactionalId,
  ];
  if (schemaRegistryEnabled) {
    resourceTypes.push(ResourceTypeSubject, ResourceTypeSchemaRegistry);
  }

  return resourceTypes.map((resourceType, index) => ({
    ...createRule(firstId + index, resourceType),
    mode: ModeAllowAll,
    operations: Object.fromEntries(
      Object.keys(getOperationsForResourceType(resourceType)).map((op) => [op, OperationTypeAllow])
    ),
  }));
};

export const hasConfiguredOperation = (rules: Rule[]) =>
  rules.some((rule) => Object.values(rule.operations).some((operation) => operation !== OperationTypeNotSet));

// A resource type limited to one rule stays selectable on the rule that already uses it.
const isSingleRuleTypeDisabled = (rules: Rule[], ruleId: number, resourceType: ResourceType, available: boolean) => {
  const currentRule = rules.find((rule) => rule.id === ruleId);
  if (!currentRule || currentRule.resourceType === resourceType) {
    return false;
  }
  return !available || hasRuleOfType(rules, resourceType);
};

export const isClusterDisabledForRule = (rules: Rule[], ruleId: number) =>
  isSingleRuleTypeDisabled(rules, ruleId, ResourceTypeCluster, true);

export const isSchemaRegistryDisabledForRule = (rules: Rule[], ruleId: number, schemaRegistryEnabled: boolean) =>
  isSingleRuleTypeDisabled(rules, ruleId, ResourceTypeSchemaRegistry, schemaRegistryEnabled);

export const isSubjectDisabledForRule = (rules: Rule[], ruleId: number, schemaRegistryEnabled: boolean) =>
  isSingleRuleTypeDisabled(rules, ruleId, ResourceTypeSubject, schemaRegistryEnabled);

export const getSchemaRegistryTooltipText = (schemaRegistryEnabled: boolean) =>
  schemaRegistryEnabled
    ? 'Only one Schema Registry rule is allowed. A Schema Registry rule already exists.'
    : SCHEMA_REGISTRY_DISABLED_TEXT;

export const getSubjectTooltipText = (schemaRegistryEnabled: boolean) =>
  schemaRegistryEnabled
    ? 'Only one subject rule is allowed. A subject rule already exists.'
    : SCHEMA_REGISTRY_DISABLED_TEXT;

export const getResourceTypeChange = (resourceType: ResourceType): Partial<Rule> => {
  const { id: _id, ...changes } = createRule(0, resourceType);
  return changes;
};

const getModeOperation = (mode: string, current: OperationType): OperationType => {
  if (mode === ModeAllowAll) {
    return OperationTypeAllow;
  }
  return mode === ModeDenyAll ? OperationTypeDeny : current;
};

export const getPermissionModeChange = (rule: Rule, mode: string): Partial<Rule> => ({
  mode: mode as ModeType,
  operations: Object.fromEntries(
    Object.entries(rule.operations).map(([op, operationValue]) => [op, getModeOperation(mode, operationValue)])
  ),
});

// Moving one operation off the mode's permission turns an "allow all" or "deny all" rule into a custom one.
const keepsMode = (mode: ModeType, value: string) =>
  (mode !== ModeAllowAll || value === OperationTypeAllow) && (mode !== ModeDenyAll || value === OperationTypeDeny);

export const getOperationChange = (rule: Rule, operation: string, value: string): Partial<Rule> => ({
  operations: { ...rule.operations, [operation]: value as OperationType },
  mode: keepsMode(rule.mode, value) ? rule.mode : ModeCustom,
});

const PERMISSION_DESCRIPTIONS: Record<string, Record<string, string>> = {
  cluster: {
    ALTER: 'Edit cluster-level configuration properties.\nAPIs: AlterConfigs, IncrementalAlterConfigs',
    ALTER_CONFIGS: 'Edit cluster configuration properties.\nAPIs: AlterConfigs, IncrementalAlterConfigs',
    CLUSTER_ACTION:
      'Perform administrative operations on the cluster.\nAPIs: ControlledShutdown, LeaderAndIsr, UpdateMetadata, StopReplica, etc.',
    CREATE: 'Create new topics and cluster-level resources.\nAPIs: CreateTopics, CreateAcls',
    DESCRIBE: 'View cluster information and metadata.\nAPIs: DescribeCluster, DescribeConfigs',
    DESCRIBE_CONFIGS: 'View cluster configuration properties.\nAPIs: DescribeConfigs',
    IDEMPOTENT_WRITE:
      'Perform idempotent write operations to ensure exactly-once delivery.\nAPIs: Produce (with idempotence)',
  },
  topic: {
    ALTER: 'Edit topic configuration properties.\nAPIs: AlterConfigs, IncrementalAlterConfigs',
    ALTER_CONFIGS: 'Edit topic configuration properties.\nAPIs: AlterConfigs, IncrementalAlterConfigs',
    CREATE: 'Create new topics.\nAPIs: CreateTopics',
    DELETE: 'Delete topics and their data.\nAPIs: DeleteTopics',
    DESCRIBE: 'View topic metadata and information.\nAPIs: Metadata, ListOffsets, DescribeConfigs',
    DESCRIBE_CONFIGS: 'View topic configuration properties.\nAPIs: DescribeConfigs',
    READ: 'View messages from topics.\nAPIs: Fetch, OffsetFetch, ListOffsets',
    WRITE: 'Produce messages to topics.\nAPIs: Produce',
  },
  consumerGroup: {
    DELETE: 'Delete consumer groups.\nAPIs: DeleteGroups',
    DESCRIBE: 'View consumer group information and metadata.\nAPIs: DescribeGroups, ListGroups',
    READ: 'Join consumer groups and view messages.\nAPIs: JoinGroup, SyncGroup, Heartbeat, OffsetCommit, OffsetFetch',
  },
  transactionalId: {
    DESCRIBE: 'View transactional ID information.\nAPIs: DescribeTransactions',
    WRITE: 'Use transactional ID for exactly-once processing.\nAPIs: InitProducerId, AddPartitionsToTxn, EndTxn',
  },
  subject: {
    READ: 'View schema subjects and their versions.\nAPIs: GET /subjects, GET /subjects/{subject}/versions',
    WRITE: 'Create and update schema subjects.\nAPIs: POST /subjects/{subject}/versions',
    REMOVE:
      'Delete schema subjects and their versions.\nAPIs: DELETE /subjects/{subject}, DELETE /subjects/{subject}/versions/{version}',
    DESCRIBE_CONFIGS: 'View subject-level configuration properties.\nAPIs: GET /config/{subject}',
    ALTER_CONFIGS: 'Edit subject-level configuration properties.\nAPIs: PUT /config/{subject}',
  },
  schemaRegistry: {
    DESCRIBE_CONFIGS: 'View Schema Registry configuration properties.\nAPIs: GET /config',
    ALTER_CONFIGS: 'Edit Schema Registry configuration properties.\nAPIs: PUT /config',
    DESCRIBE: 'View Schema Registry information and metadata.\nAPIs: GET /subjects, GET /schemas',
    READ: 'View schemas from the Schema Registry.\nAPIs: GET /schemas/ids/{id}, GET /subjects/{subject}/versions/{version}/schema',
  },
};

export const getPermissionDescription = (operation: string, resourceType: string): string | undefined =>
  PERMISSION_DESCRIPTIONS[resourceType]?.[operation];
