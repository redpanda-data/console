/** biome-ignore-all lint/correctness/useUniqueElementIds: this is intentional for form usage */
import { Button } from 'components/redpanda-ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardField,
  CardForm,
  CardHeader,
  CardTitle,
} from 'components/redpanda-ui/components/card';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Check, Circle, HelpCircle, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Features } from 'state/supported-features';

import {
  type AclRulesProps,
  getIdFromRule,
  getOperationsForResourceType,
  getRuleDataTestId,
  type HostType,
  HostTypeAllowAllHosts,
  HostTypeSpecificHost,
  ModeAllowAll,
  ModeCustom,
  ModeDenyAll,
  type OperationType,
  OperationTypeAllow,
  OperationTypeDeny,
  OperationTypeNotSet,
  type PrincipalType,
  parsePrincipal,
  ResourcePatternTypeAny,
  ResourcePatternTypeLiteral,
  ResourcePatternTypePrefix,
  type ResourceType,
  ResourceTypeCluster,
  ResourceTypeConsumerGroup,
  ResourceTypeSchemaRegistry,
  type ResourceTypeSelectionProps,
  ResourceTypeSubject,
  ResourceTypeTopic,
  ResourceTypeTransactionalId,
  RoleTypeRedpandaRole,
  RoleTypeUser,
  type Rule,
  type SharedConfig,
  type SharedConfigProps,
  type SummaryProps,
} from './acl.model';

const UNDERSCORE_REGEX = /_/g;
const FIRST_CHAR_REGEX = /^\w/;
const COLON_REGEX = /:/;
const PRINCIPAL_PREFIX_REGEX = /^[^:]+:/;

// Helper function to convert UPPER_CASE strings to sentence case ex: ALTER => Alter ALTER_CONFIG => Alter config
export const formatLabel = (text: string): string => {
  return text
    .replace(UNDERSCORE_REGEX, ' ')
    .toLowerCase()
    .replace(FIRST_CHAR_REGEX, (c) => c.toUpperCase())
    .replace('id', 'ID'); // transactional ids => transactional IDs
};

// Helper function to get resource name for selector label
const getResourceName = (resourceType: ResourceType): string => {
  const resourceNames: Record<string, string> = {
    [ResourceTypeTopic]: 'Topic',
    [ResourceTypeConsumerGroup]: 'Consumer group',
    [ResourceTypeTransactionalId]: 'Transactional ID',
    [ResourceTypeSubject]: 'Subject',
    [ResourceTypeSchemaRegistry]: 'Schema registry',
  };
  return resourceNames[resourceType] || resourceType;
};

// Helper function to get plural resource name
const getPluralResourceName = (resourceType: ResourceType): string => {
  const pluralNames: Record<string, string> = {
    [ResourceTypeCluster]: 'clusters',
    [ResourceTypeTopic]: 'topics',
    [ResourceTypeConsumerGroup]: 'consumer groups',
    [ResourceTypeTransactionalId]: 'transactional IDs',
    [ResourceTypeSubject]: 'subjects',
    [ResourceTypeSchemaRegistry]: 'schema registries',
  };
  return pluralNames[resourceType] || resourceType;
};

function stringToHostType(h: string): HostType {
  switch (h) {
    case '*':
    case '':
      return HostTypeAllowAllHosts;
    default:
      return HostTypeSpecificHost;
  }
}

const ResourceTypeSelection = ({
  rule,
  handleResourceTypeChange,
  isClusterDisabledForRule,
  isSchemaRegistryDisabledForRule,
  isSchemaRegistryEnabled,
  ruleIndex,
  getSchemaRegistryTooltipText,
  getSubjectTooltipText,
}: ResourceTypeSelectionProps) => {
  const buttons = [
    {
      name: 'Cluster',
      resourceType: ResourceTypeCluster,
      disabled: isClusterDisabledForRule(rule.id),
      tooltipText: 'Only one cluster rule is allowed. A cluster rule already exists.',
    },
    {
      name: 'Topic',
      resourceType: ResourceTypeTopic,
    },
    {
      name: 'Consumer Group',
      resourceType: ResourceTypeConsumerGroup,
    },
    {
      name: 'Transactional ID',
      resourceType: ResourceTypeTransactionalId,
    },
    {
      name: 'Subject',
      resourceType: ResourceTypeSubject,
      disabled: !isSchemaRegistryEnabled,
      tooltipText: getSubjectTooltipText(),
    },
    {
      name: 'Schema Registry',
      resourceType: ResourceTypeSchemaRegistry,
      disabled: !isSchemaRegistryEnabled || isSchemaRegistryDisabledForRule(rule.id),
      tooltipText: getSchemaRegistryTooltipText(),
    },
  ];

  return (
    <span className="h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-600 md:inline-flex">
      {/*TODO: Add tooltip with <p>Only one cluster rule is allowed. A cluster rule already exists.</p>*/}
      {buttons.map(({ name, resourceType, disabled, tooltipText }) => (
        <TooltipProvider key={`rt-${resourceType}-tooltip-${ruleIndex}`}>
          <Tooltip>
            <TooltipTrigger>
              <Button
                className={
                  rule.resourceType === resourceType
                    ? 'bg-gray-900 text-white shadow-sm hover:bg-gray-800'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
                data-testid={`rt-${resourceType}-button-${ruleIndex}`}
                disabled={disabled}
                key={`rt-${resourceType}-button-${ruleIndex}`}
                onClick={() => handleResourceTypeChange(rule.id, resourceType)}
                size="sm"
                variant={rule.resourceType === resourceType ? 'default' : 'ghost'}
              >
                {name}
              </Button>
            </TooltipTrigger>
            <TooltipContent hidden={!disabled}>
              <p className="max-w-xs">{tooltipText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </span>
  );
};

const Summary = ({ sharedConfig, rules }: SummaryProps) => {
  return (
    <Card className="bg-slate-100" size="full">
      <CardHeader>
        <h3>Summary</h3>
      </CardHeader>
      <CardContent>
        {/* Shared Configuration Summary */}
        <div>
          <div className="rounded-lg border-0">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Principal:</span>
              <span className="font-medium text-gray-900">{sharedConfig.principal.replace(COLON_REGEX, ': ')}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Host:</span>
              <span className="font-medium text-gray-900">
                {sharedConfig.host === '*' ? 'All hosts' : sharedConfig.host}
              </span>
            </div>
          </div>
        </div>

        {/* Rules Summary */}
        <div className="space-y-3">
          {rules.map((rule) => {
            const ops = Object.entries(rule.operations);
            // Filter out operations that are not set
            const enabledOperations = ops
              .filter(([_, operationValue]) => operationValue !== OperationTypeNotSet)
              .map(([op, operationValue]) => ({
                name: formatLabel(op),
                value: operationValue,
                originalOperationName: op,
              }));

            // Check if all operations have the same permission
            const allAllow =
              enabledOperations.length > 0 &&
              enabledOperations.length === ops.length &&
              enabledOperations.every((op) => op.value === OperationTypeAllow);
            const allDeny =
              enabledOperations.length > 0 &&
              enabledOperations.length === ops.length &&
              enabledOperations.every((op) => op.value === OperationTypeDeny);
            const showSummary = allAllow || allDeny;

            return (
              <div
                className="space-y-2 rounded-lg border border-gray-200 bg-white/40 p-3"
                data-testid={`summary-card-${getRuleDataTestId(rule)}`}
                key={rule.id}
              >
                {/* Combined Resource and Selector */}
                <p className="text-gray-600 text-xs" data-testid={`${getRuleDataTestId(rule)}-title`}>
                  {(() => {
                    let text: string;
                    if (rule.resourceType === ResourceTypeCluster || rule.resourceType === ResourceTypeSchemaRegistry) {
                      text = getResourceName(rule.resourceType);
                    } else if (rule.selectorType === ResourcePatternTypeAny) {
                      text = `All ${getPluralResourceName(rule.resourceType)}`;
                    } else {
                      const matchType = rule.selectorType === ResourcePatternTypeLiteral ? 'matching' : 'starting with';
                      text = `${getPluralResourceName(rule.resourceType)} ${matchType}: "${rule.selectorValue}"`;
                    }
                    return formatLabel(text);
                  })()}
                </p>

                {/* Operations */}
                <div>
                  {enabledOperations.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {showSummary ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 font-medium text-xs ${
                            allAllow ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {allAllow ? 'Allow all' : 'Deny all'}
                        </span>
                      ) : (
                        enabledOperations.map((op) => (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 font-medium text-xs ${
                              op.value === OperationTypeAllow
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                            data-testid={`${getRuleDataTestId(rule)}-op-${op.originalOperationName}`}
                            key={op.name}
                          >
                            {op.name}: {op.value}
                          </span>
                        ))
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs italic">No operations configured</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

const AclRules = ({
  rules,
  addRule,
  addAllowAllOperations,
  removeRule,
  updateRule,
  handleResourceTypeChange,
  isClusterDisabledForRule,
  isSchemaRegistryDisabledForRule,
  isSubjectDisabledForRule,
  getSchemaRegistryTooltipText,
  getSubjectTooltipText,
  handlePermissionModeChange,
  handleOperationChange,
  getPermissionIcon,
  getPermissionDescription,
  schemaRegistryEnabled,
}: AclRulesProps) => {
  return (
    <Card size={'full'}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-medium text-gray-900 text-lg">ACL rules</CardTitle>
            <CardDescription className="text-gray-600">
              Configure permissions for different resource types
            </CardDescription>
          </div>
          <Button data-testid="add-allow-all-operations-button" onClick={addAllowAllOperations} variant="outline">
            Allow all operations
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rules.map((rule, index) => (
          <Card
            className={`card-content-rule-${index} px-10`}
            data-testid={`card-content-rule-${getRuleDataTestId(rule)}`}
            key={rule.id}
            size={'full'}
            variant={'elevated'}
          >
            <CardContent>
              {/* Resource Type Selection */}
              <div className="flex items-center justify-between">
                <span>
                  <Label className="mb-1.5 block font-medium text-gray-700 text-sm">Select a resource type</Label>
                  <ResourceTypeSelection
                    getSchemaRegistryTooltipText={getSchemaRegistryTooltipText}
                    getSubjectTooltipText={getSubjectTooltipText}
                    handleResourceTypeChange={handleResourceTypeChange}
                    isClusterDisabledForRule={isClusterDisabledForRule}
                    isSchemaRegistryDisabledForRule={isSchemaRegistryDisabledForRule}
                    isSchemaRegistryEnabled={schemaRegistryEnabled}
                    isSubjectDisabledForRule={isSubjectDisabledForRule}
                    rule={rule}
                    ruleIndex={index}
                  />
                </span>
                <Button
                  data-testid={`remove-rule-button-${getRuleDataTestId(rule)}`}
                  onClick={() => removeRule(rule.id)}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              </div>

              {/* Resource Name Selector */}
              {/* Show selector if resource type is not Cluster or SchemaRegistry */}
              {!(rule.resourceType === ResourceTypeCluster || rule.resourceType === ResourceTypeSchemaRegistry) && (
                <div className="mb-6 space-y-2">
                  <Label className="font-medium text-gray-700 text-sm">Selector</Label>
                  <div className="grid grid-cols-4 gap-3">
                    <Select
                      onValueChange={(value) =>
                        updateRule(rule.id, {
                          selectorType: value,
                          selectorValue: value === ResourcePatternTypeAny ? '' : rule.selectorValue,
                        })
                      }
                      value={rule.selectorType}
                    >
                      <SelectTrigger testId={`selector-type-select-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ResourcePatternTypeAny}>
                          All {getPluralResourceName(rule.resourceType)}
                        </SelectItem>
                        <SelectItem value={ResourcePatternTypeLiteral}>
                          {getResourceName(rule.resourceType)} names matching
                        </SelectItem>
                        <SelectItem value={ResourcePatternTypePrefix}>
                          {getResourceName(rule.resourceType)} names starting with
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {(rule.selectorType === ResourcePatternTypeLiteral ||
                      rule.selectorType === ResourcePatternTypePrefix) && (
                      <div className="col-span-3">
                        <Input
                          className="flex-1 border-gray-300 focus:border-gray-500 focus:ring-gray-500"
                          onChange={(e) =>
                            updateRule(rule.id, {
                              selectorValue: e.target.value,
                            })
                          }
                          placeholder={`Enter ${rule.selectorType} match`}
                          testId={`selector-value-input-${index}`}
                          value={rule.selectorValue}
                        />
                        <p
                          className={`text-red-600 text-sm ${!!rule.selectorValue.length && 'hidden'}`}
                          data-testid={`selector-value-error-${index}`}
                        >
                          {rule.selectorType === ResourcePatternTypeLiteral
                            ? 'Literal match cannot be empty'
                            : 'Prefix match cannot be empty'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Permission Mode */}
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <Label className="font-medium text-gray-700 text-sm">Operations</Label>
                  <div className="inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-600">
                    <button
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 font-medium text-sm ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
                        rule.mode === ModeCustom
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                      data-testid={`mode-custom-button-${index}`}
                      onClick={() => handlePermissionModeChange(rule.id, ModeCustom)}
                      type="button"
                    >
                      Custom
                    </button>
                    <button
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 font-medium text-sm ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
                        rule.mode === ModeAllowAll
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                      data-testid={`mode-allow-all-button-${index}`}
                      onClick={() => handlePermissionModeChange(rule.id, ModeAllowAll)}
                      type="button"
                    >
                      Allow all
                    </button>
                    <button
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 font-medium text-sm ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
                        rule.mode === ModeDenyAll
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                      data-testid={`mode-deny-all-button-${index}`}
                      onClick={() => handlePermissionModeChange(rule.id, ModeDenyAll)}
                      type="button"
                    >
                      Deny all
                    </button>
                  </div>
                </div>
              </div>

              {/* Operations */}
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {Object.entries(rule.operations).map(([operation, operationValue]) => (
                  <div className="flex items-center gap-1" key={operation}>
                    <Select
                      disabled={false}
                      onValueChange={(value) => handleOperationChange(rule.id, operation, value)}
                      value={operationValue}
                    >
                      <SelectTrigger
                        className="h-10 flex-1 justify-between border-gray-300 focus:border-gray-500 focus:ring-gray-500/20"
                        data-testid={`operation-select-${operation}`}
                      >
                        <div className="flex items-center space-x-2">
                          {getPermissionIcon(operationValue)}
                          <span
                            className={`font-medium text-sm ${operationValue === OperationTypeNotSet ? 'text-gray-400' : 'text-gray-900'}`}
                          >
                            {formatLabel(operation)}
                          </span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          data-testid={`ro-${getIdFromRule(rule, operation, OperationTypeNotSet)}`}
                          value={OperationTypeNotSet}
                        >
                          <div className="flex items-center space-x-2">
                            <Circle className="h-4 w-4 text-gray-400" />
                            <span>Not set</span>
                          </div>
                        </SelectItem>
                        <SelectItem
                          data-testid={`ro-${getIdFromRule(rule, operation, OperationTypeAllow)}`}
                          value={OperationTypeAllow}
                        >
                          <div className="flex items-center space-x-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span>Allow</span>
                          </div>
                        </SelectItem>
                        <SelectItem
                          data-testid={`ro-${getIdFromRule(rule, operation, OperationTypeDeny)}`}
                          value={OperationTypeDeny}
                        >
                          <div className="flex items-center space-x-2">
                            <X className="h-4 w-4 text-red-600" />
                            <span>Deny</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 cursor-help text-gray-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">{getPermissionDescription(operation, rule.resourceType)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add Rule Button */}
        <div className="mt-6">
          <Button className="w-full" data-testid="add-acl-rule-button" onClick={addRule} variant="outline">
            <Plus className="h-4 w-4" />
            Add rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const SharedConfiguration = ({
  sharedConfig,
  setSharedConfig,
  edit,
  principalType: propPrincipalType,
  principalError,
}: SharedConfigProps & { principalType?: PrincipalType; principalError?: string }) => {
  const [principalType, setPrincipalType] = useState(
    propPrincipalType ? propPrincipalType.replace(':', '') : parsePrincipal(sharedConfig.principal).type || RoleTypeUser
  );
  const [hostType, setHostType] = useState<HostType>(stringToHostType(sharedConfig.host));

  return (
    <Card size={'full'}>
      <CardHeader className="pb-4">
        <CardTitle className="font-medium text-gray-900 text-lg">Shared configuration</CardTitle>
        <CardDescription className="text-gray-600">These settings apply to all rules.</CardDescription>
      </CardHeader>
      <CardContent>
        <CardForm>
          <CardField>
            <div className="flex items-center gap-1">
              <Label className="font-medium text-gray-700 text-sm" htmlFor="principal">
                User / principal
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 cursor-help text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div>
                      <p>
                        The user getting permissions granted or denied. In Kafka, this user is known as the principal.
                      </p>
                      <ul className="mt-2 space-y-1 text-sm">
                        <li>• Use the wildcard * to target all users.</li>
                        <li>• Do not include the prefix. For example, use my-user instead of User:my-user.</li>
                      </ul>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Select
                disabled={edit}
                onValueChange={(value) => {
                  setPrincipalType(value);
                  // Update the principal to include the new type
                  const currentValue = parsePrincipal(sharedConfig.principal).name || '';
                  setSharedConfig({
                    ...sharedConfig,
                    principal: `${value}:${currentValue}`,
                  });
                }}
                value={principalType}
              >
                <SelectTrigger testId="shared-principal-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RoleTypeUser}>User</SelectItem>
                  <SelectItem value={RoleTypeRedpandaRole}>Redpanda role</SelectItem>
                </SelectContent>
              </Select>
              <div className="col-span-3 gap-1">
                <Input
                  disabled={edit}
                  id="principal"
                  onChange={(e) =>
                    setSharedConfig({
                      ...sharedConfig,
                      principal: `${principalType}:${e.target.value}`,
                    })
                  }
                  placeholder="analytics-writer"
                  testId="shared-principal-input"
                  value={sharedConfig.principal.replace(PRINCIPAL_PREFIX_REGEX, '')}
                />
                {principalError && (
                  <p className="text-red-600 text-sm" data-testid="principal-error">
                    {principalError}
                  </p>
                )}
              </div>
            </div>
          </CardField>
        </CardForm>
        <br />

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label className="font-medium text-gray-700 text-sm" htmlFor="host">
                Host
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 cursor-help text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      The IP address or hostname from which the user is allowed or denied access. Use * to allow from
                      any host.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex gap-3">
              <Select
                disabled={edit}
                onValueChange={(value) => {
                  setHostType(value as HostType);
                  if (value === HostTypeAllowAllHosts) {
                    setSharedConfig({
                      ...sharedConfig,
                      host: '*',
                    });
                  }
                }}
                value={hostType}
              >
                <SelectTrigger
                  className="w-48 focus:border-gray-500 focus:ring-gray-500/20"
                  data-testid="shared-host-button"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HostTypeAllowAllHosts}>Allow all hosts</SelectItem>
                  <SelectItem value={HostTypeSpecificHost}>Specific IP addresses</SelectItem>
                </SelectContent>
              </Select>
              {hostType === HostTypeSpecificHost && (
                <Input
                  className="flex-1 border-gray-300 focus:border-gray-500 focus:ring-gray-500"
                  disabled={edit}
                  id="host"
                  onChange={(e) =>
                    setSharedConfig({
                      ...sharedConfig,
                      host: e.target.value,
                    })
                  }
                  placeholder="1.1.1.1"
                  testId="shared-host-input"
                  value={sharedConfig.host === '*' ? '' : sharedConfig.host}
                />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

type CreateACLProps = {
  onSubmit?: (principal: string, host: string, rules: Rule[]) => Promise<void>;
  onCancel: () => void;
  rules?: Rule[];
  sharedConfig?: SharedConfig;
  edit: boolean;
  principalType?: PrincipalType;
};

export default function CreateACL({
  onSubmit,
  onCancel,
  rules: propRules,
  sharedConfig: propSharedConfig,
  edit,
  principalType,
}: CreateACLProps) {
  const schemaRegistryEnabled = Features.schemaRegistryACLApi;
  const [principalError, setPrincipalError] = useState<string>('');
  const [sharedConfig, setSharedConfig] = useState({
    principal: propSharedConfig?.principal ?? (principalType ? `${principalType}` : 'User:'),
    host: propSharedConfig?.host ?? '*',
  });

  const [rules, setRules] = useState<Rule[]>(
    propRules ?? [
      {
        id: 1,
        resourceType: ResourceTypeCluster,
        mode: ModeCustom,
        selectorType: ResourcePatternTypeAny,
        selectorValue: '',
        operations: {
          ALTER: OperationTypeNotSet,
          ALTER_CONFIGS: OperationTypeNotSet,
          CLUSTER_ACTION: OperationTypeNotSet,
          CREATE: OperationTypeNotSet,
          DESCRIBE: OperationTypeNotSet,
          DESCRIBE_CONFIGS: OperationTypeNotSet,
          IDEMPOTENT_WRITE: OperationTypeNotSet,
        },
      },
    ]
  );

  const isValidRule = rules.find((r) => Object.entries(r.operations).some(([, o]) => o !== OperationTypeNotSet));

  useEffect(() => {
    if (parsePrincipal(sharedConfig.principal).type) {
      setPrincipalError('');
    }
  }, [sharedConfig.principal]);

  const addRule = () => {
    // Determine the default resource type for new rules
    let defaultResourceType = ResourceTypeCluster;
    if (hasClusterRule()) {
      defaultResourceType = ResourceTypeTopic;
    }

    const newRule = {
      id: Date.now(),
      resourceType: defaultResourceType as ResourceType,
      mode: ModeCustom,
      selectorType: ResourcePatternTypeAny,
      selectorValue: '',
      operations: getOperationsForResourceType(defaultResourceType),
    };
    setRules([...rules, newRule]);
  };

  const addAllowAllOperations = () => {
    const resourceTypes = [
      ResourceTypeCluster,
      ResourceTypeTopic,
      ResourceTypeConsumerGroup,
      ResourceTypeTransactionalId,
    ];

    if (schemaRegistryEnabled) {
      resourceTypes.push(ResourceTypeSubject, ResourceTypeSchemaRegistry);
    }

    const newRules: Rule[] = [];

    resourceTypes.forEach((resourceType, index) => {
      const operations = getOperationsForResourceType(resourceType);
      const allowAllOperations = Object.fromEntries(Object.entries(operations).map(([op]) => [op, OperationTypeAllow]));

      newRules.push({
        id: Date.now() + index,
        resourceType,
        mode: ModeAllowAll,
        selectorType: ResourcePatternTypeAny,
        selectorValue: '',
        operations: {
          ...allowAllOperations,
        },
      });
    });

    setRules(() => newRules);
  };

  const removeRule = (id: number) => {
    setRules(rules.filter((rule) => rule.id !== id));
  };

  const updateRule = (id: number, updates: Partial<Rule>) => {
    setRules(rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  };

  const handleResourceTypeChange = (ruleId: number, resourceType: ResourceType) => {
    updateRule(ruleId, {
      resourceType,
      selectorType: ResourcePatternTypeAny,
      selectorValue: '',
      operations: getOperationsForResourceType(resourceType),
      mode: ModeCustom,
    } as Rule);
  };

  const hasClusterRule = () => rules.some((rule) => rule.resourceType === ResourceTypeCluster);

  const isClusterDisabledForRule = (ruleId: number) => {
    const currentRule = rules.find((rule) => rule.id === ruleId);
    if (!currentRule) {
      return false;
    }

    // If current rule is already cluster, don't disable it
    if (currentRule.resourceType === ResourceTypeCluster) {
      return false;
    }

    // If there's already a cluster rule, disable cluster for this rule
    return hasClusterRule();
  };

  const hasSubjectRule = () => rules.some((rule) => rule.resourceType === ResourceTypeSubject);

  const hasSchemaRegistryRule = () => rules.some((rule) => rule.resourceType === ResourceTypeSchemaRegistry);

  const isSchemaRegistryDisabledForRule = (ruleId: number) => {
    const currentRule = rules.find((rule) => rule.id === ruleId);
    if (!currentRule) {
      return false;
    }

    // If Schema Registry is not enabled, disable it for all rules except existing schema registry rules
    if (!schemaRegistryEnabled && currentRule.resourceType !== ResourceTypeSchemaRegistry) {
      return true;
    }

    // If current rule is already schemaRegistry, don't disable it
    if (currentRule.resourceType === ResourceTypeSchemaRegistry) {
      return false;
    }

    // If there's already a schemaRegistry rule, disable schemaRegistry for this rule
    return hasSchemaRegistryRule();
  };

  const getSchemaRegistryTooltipText = () => {
    if (!schemaRegistryEnabled) {
      return 'Schema Registry is not enabled.';
    }
    return 'Only one schema registry rule is allowed. A schema registry rule already exists.';
  };

  const getSubjectTooltipText = () => {
    if (!schemaRegistryEnabled) {
      return 'Schema Registry is not enabled.';
    }
    return 'Only one subject rule is allowed. A subject rule already exists.';
  };

  const isSubjectDisabledForRule = (ruleId: number) => {
    const currentRule = rules.find((rule) => rule.id === ruleId);
    if (!currentRule) {
      return false;
    }

    // If current rule is already subject, don't disable it
    if (currentRule.resourceType === ResourceTypeSubject) {
      return false;
    }

    // If schema registry is not enabled, disable subject
    if (!schemaRegistryEnabled) {
      return true;
    }

    // If there's already a subject rule, disable subject for this rule
    return hasSubjectRule();
  };

  const handlePermissionModeChange = (ruleId: number, mode: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) {
      return;
    }

    const updatedOperations = Object.fromEntries(
      Object.entries(rule.operations).map(([op, operationValue]) => {
        let newValue: string;
        if (mode === ModeAllowAll) {
          newValue = OperationTypeAllow;
        } else if (mode === ModeDenyAll) {
          newValue = OperationTypeDeny;
        } else {
          newValue = operationValue;
        }
        return [op, newValue];
      })
    );

    updateRule(ruleId, { mode, operations: updatedOperations });
  };

  const handleOperationChange = (ruleId: number, operation: string, value: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) {
      return;
    }

    const updatedOperations = {
      ...rule.operations,
      [operation]: value as OperationType,
    };

    // Check if the current mode should be switched to custom
    let newMode = rule.mode;
    if (rule.mode === ModeAllowAll && value !== OperationTypeAllow) {
      newMode = ModeCustom;
    } else if (rule.mode === ModeDenyAll && value !== OperationTypeDeny) {
      newMode = ModeCustom;
    }

    updateRule(ruleId, {
      operations: updatedOperations,
      mode: newMode,
    });
  };

  const getPermissionIcon = (value: string) => {
    switch (value) {
      case OperationTypeAllow:
        return <Check className="h-4 w-4 text-green-600" />;
      case OperationTypeDeny:
        return <X className="h-4 w-4 text-red-600" />;
      default:
        return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getPermissionDescription = (operation: string, resourceType: string) => {
    const descriptions: Record<string, Record<string, string>> = {
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

    // Render newlines as <br /> in tooltips
    const desc = descriptions[resourceType]?.[operation];
    if (!desc) {
      return 'Permission description not available';
    }
    return (
      <>
        {desc.split('\n').map((line, i) => (
          <span key={i}>
            {line}
            <br />
          </span>
        ))}
      </>
    );
  };

  // Track open state for each matching section per rule and section type
  const [openMatchingSections, setOpenMatchingSections] = useState<Record<string, boolean>>({});

  // Helper to get a unique key for each rule and section type
  const getSectionKey = (ruleId: number, section: string) => `${ruleId}-${section}`;

  return (
    <div>
      {/* Page Header - Sticky */}

      {/* Main Content */}
      <main className="pb-6">
        <div className="mx-auto">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Left Column - Main Form */}
            <div className="space-y-6 lg:col-span-2">
              <p className="h-12 text-gray-600 text-sm">Configure access control rules for your Kafka resources</p>

              <SharedConfiguration
                edit={edit}
                getSectionKey={getSectionKey}
                openMatchingSections={openMatchingSections}
                principalError={principalError}
                principalType={principalType}
                setOpenMatchingSections={setOpenMatchingSections}
                setSharedConfig={setSharedConfig}
                sharedConfig={sharedConfig}
              />

              <AclRules
                addAllowAllOperations={addAllowAllOperations}
                addRule={addRule}
                getPermissionDescription={getPermissionDescription}
                getPermissionIcon={getPermissionIcon}
                getSchemaRegistryTooltipText={getSchemaRegistryTooltipText}
                getSectionKey={getSectionKey}
                getSubjectTooltipText={getSubjectTooltipText}
                handleOperationChange={handleOperationChange}
                handlePermissionModeChange={handlePermissionModeChange}
                handleResourceTypeChange={handleResourceTypeChange}
                isClusterDisabledForRule={isClusterDisabledForRule}
                isSchemaRegistryDisabledForRule={isSchemaRegistryDisabledForRule}
                isSubjectDisabledForRule={isSubjectDisabledForRule}
                openMatchingSections={openMatchingSections}
                removeRule={removeRule}
                rules={rules}
                schemaRegistryEnabled={schemaRegistryEnabled}
                setOpenMatchingSections={setOpenMatchingSections}
                updateRule={updateRule}
              />
            </div>

            {/* Right Column - Summary Card */}
            <div className="lg:col-span-1">
              <div className="sticky top-20">
                <div className="mb-2 flex h-10 justify-end gap-2">
                  <Button className="sticky border-gray-300 text-gray-700" onClick={onCancel} variant="outline">
                    Cancel
                  </Button>
                  <Button
                    className="sticky bg-gray-900 text-white hover:bg-gray-800"
                    data-testid="submit-acl-button"
                    disabled={!!principalError || !isValidRule}
                    onClick={() => {
                      if (parsePrincipal(sharedConfig.principal).name) {
                        onSubmit?.(sharedConfig.principal, sharedConfig.host, rules);
                      } else {
                        setPrincipalError('Principal is required');
                      }
                    }}
                  >
                    {edit ? 'Save' : 'Create'}
                  </Button>
                </div>
                <Summary rules={rules} sharedConfig={sharedConfig} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
