import { Check, Circle, HelpCircle, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/redpanda-ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/redpanda-ui/card';
import { Input } from '@/components/redpanda-ui/input';
import { Label } from '@/components/redpanda-ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/redpanda-ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/redpanda-ui/tooltip';
import {
  type AclRulesProps,
  getIdFromRule,
  getOperationsForResourceType,
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
} from './ACL.model';
import { getRuleDataTestId } from './ACL.model';

// Helper function to convert UPPER_CASE strings to sentence case ex: ALTER => Alter ALTER_CONFIG => Alter config
export const formatLabel = (text: string): string => {
  return text
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
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
  isSubjectDisabledForRule,
  isSchemaRegistryDisabledForRule,
  getSubjectTooltipText,
  getSchemaRegistryTooltipText,
  ruleIndex,
}: ResourceTypeSelectionProps) => {
  return (
    <div className="inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-600">
      {isClusterDisabledForRule(rule.id) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              disabled
              className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-gray-400 cursor-not-allowed"
            >
              Cluster
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Only one cluster rule is allowed. A cluster rule already exists.</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button
          onClick={() => handleResourceTypeChange(rule.id, ResourceTypeCluster)}
          variant={rule.resourceType === ResourceTypeCluster ? 'default' : 'ghost'}
          size="sm"
          className={
            rule.resourceType === ResourceTypeCluster
              ? 'bg-gray-900 text-white shadow-sm hover:bg-gray-800'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }
          data-testid={`rt-${ResourceTypeCluster}-button-${ruleIndex}`}
        >
          Cluster
        </Button>
      )}
      <Button
        onClick={() => handleResourceTypeChange(rule.id, ResourceTypeTopic)}
        variant={rule.resourceType === ResourceTypeTopic ? 'default' : 'ghost'}
        size="sm"
        className={
          rule.resourceType === ResourceTypeTopic
            ? 'bg-gray-900 text-white shadow-sm hover:bg-gray-800'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }
        data-testid={`rt-${ResourceTypeTopic}-button-${ruleIndex}`}
      >
        Topic
      </Button>
      <Button
        onClick={() => handleResourceTypeChange(rule.id, ResourceTypeConsumerGroup)}
        variant={rule.resourceType === ResourceTypeConsumerGroup ? 'default' : 'ghost'}
        size="sm"
        className={
          rule.resourceType === ResourceTypeConsumerGroup
            ? 'bg-gray-900 text-white shadow-sm hover:bg-gray-800'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }
        data-testid={`rt-${ResourceTypeConsumerGroup}-button-${ruleIndex}`}
      >
        Consumer Group
      </Button>
      <Button
        onClick={() => handleResourceTypeChange(rule.id, ResourceTypeTransactionalId)}
        variant={rule.resourceType === ResourceTypeTransactionalId ? 'default' : 'ghost'}
        size="sm"
        className={
          rule.resourceType === ResourceTypeTransactionalId
            ? 'bg-gray-900 text-white shadow-sm hover:bg-gray-800'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }
        data-testid={`rt-${ResourceTypeTransactionalId}-button-${ruleIndex}`}
      >
        Transactional ID
      </Button>
      {isSubjectDisabledForRule(rule.id) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              disabled
              className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-gray-400 cursor-not-allowed"
            >
              Subject
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getSubjectTooltipText()}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button
          onClick={() => handleResourceTypeChange(rule.id, ResourceTypeSubject)}
          variant={rule.resourceType === ResourceTypeSubject ? 'default' : 'ghost'}
          size="sm"
          className={
            rule.resourceType === ResourceTypeSubject
              ? 'bg-gray-900 text-white shadow-sm hover:bg-gray-800'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }
          data-testid={`rt-${ResourceTypeSubject}-button-${ruleIndex}`}
        >
          Subject
        </Button>
      )}
      {isSchemaRegistryDisabledForRule(rule.id) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              disabled
              className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-gray-400 cursor-not-allowed"
            >
              Schema Registry
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getSchemaRegistryTooltipText()}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button
          onClick={() => handleResourceTypeChange(rule.id, ResourceTypeSchemaRegistry)}
          variant={rule.resourceType === ResourceTypeSchemaRegistry ? 'default' : 'ghost'}
          size="sm"
          className={
            rule.resourceType === ResourceTypeSchemaRegistry
              ? 'bg-gray-900 text-white shadow-sm hover:bg-gray-800'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }
          data-testid={`rt-${ResourceTypeSchemaRegistry}-button-${ruleIndex}`}
        >
          Schema Registry
        </Button>
      )}
    </div>
  );
};

const Summary = ({ sharedConfig, rules }: SummaryProps) => {
  return (
    <Card className="border-gray-200 bg-slate-100">
      <div className="px-6 pt-6 pb-4 text-lg font-normal text-gray-900 tracking-tight">Summary</div>
      <CardContent className="space-y-6">
        {/* Shared Configuration Summary */}
        <div>
          <div className="rounded-lg border-0">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Principal:</span>
              <span className="font-medium text-gray-900">{sharedConfig.principal.replace(/:/, ': ')}</span>
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
        <div>
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
                  key={rule.id}
                  data-testid={`summary-card-${getRuleDataTestId(rule)}`}
                  className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white/40"
                >
                  {/* Combined Resource and Selector */}
                  <p data-testid={`${getRuleDataTestId(rule)}-title`} className="text-xs text-gray-600">
                    {(() => {
                      const text =
                        rule.resourceType === ResourceTypeCluster || rule.resourceType === ResourceTypeSchemaRegistry
                          ? getResourceName(rule.resourceType)
                          : rule.selectorType === ResourcePatternTypeAny
                            ? `All ${getPluralResourceName(rule.resourceType)}`
                            : `${getPluralResourceName(rule.resourceType)} ${rule.selectorType === ResourcePatternTypeLiteral ? 'matching' : 'starting with'}: "${rule.selectorValue}"`;
                      return formatLabel(text);
                    })()}
                  </p>

                  {/* Operations */}
                  <div>
                    {enabledOperations.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {showSummary ? (
                          <span
                            className={`inline-flex items-center px-2 py-1 text-xs rounded-full font-medium ${
                              allAllow ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {allAllow ? 'Allow all' : 'Deny all'}
                          </span>
                        ) : (
                          enabledOperations.map((op) => (
                            <span
                              key={op.name}
                              data-testid={`${getRuleDataTestId(rule)}-op-${op.originalOperationName}`}
                              className={`inline-flex items-center px-2 py-1 text-xs rounded-full font-medium ${
                                op.value === OperationTypeAllow
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {op.name}: {op.value}
                            </span>
                          ))
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No operations configured</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
}: AclRulesProps) => {
  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-medium text-gray-900">ACL rules</CardTitle>
            <CardDescription className="text-gray-600">
              Configure permissions for different resource types
            </CardDescription>
          </div>
          <Button onClick={addAllowAllOperations} variant="secondary">
            Allow all operations
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {rules.map((rule, index) => (
          <Card
            key={rule.id}
            data-testid={`card-content-rule-${getRuleDataTestId(rule)}`}
            className={`border border-gray-200 card-content-rule-${index}`}
          >
            <CardContent className="p-6">
              {/* Resource Type Selection */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Select a resource type</Label>
                    <ResourceTypeSelection
                      rule={rule}
                      handleResourceTypeChange={handleResourceTypeChange}
                      isClusterDisabledForRule={isClusterDisabledForRule}
                      isSubjectDisabledForRule={isSubjectDisabledForRule}
                      isSchemaRegistryDisabledForRule={isSchemaRegistryDisabledForRule}
                      getSubjectTooltipText={getSubjectTooltipText}
                      getSchemaRegistryTooltipText={getSchemaRegistryTooltipText}
                      ruleIndex={index}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRule(rule.id)}
                    className="text-gray-400 hover:text-red-600"
                    data-testid={`remove-rule-button-${getRuleDataTestId(rule)}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Resource Name Selector */}
              {/* Show selector if resource type is not Cluster or SchemaRegistry */}
              {!(rule.resourceType === ResourceTypeCluster || rule.resourceType === ResourceTypeSchemaRegistry) && (
                <div className="space-y-2 mb-6">
                  <Label className="text-sm font-medium text-gray-700">Selector</Label>
                  <div className="flex gap-3">
                    <Select
                      value={rule.selectorType}
                      onValueChange={(value) =>
                        updateRule(rule.id, {
                          selectorType: value,
                          selectorValue: value === ResourcePatternTypeAny ? '' : rule.selectorValue,
                        })
                      }
                    >
                      <SelectTrigger
                        data-testid={`selector-type-select-${index}`}
                        className="w-48 focus:border-gray-500 focus:ring-gray-500/20"
                      >
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
                      <Input
                        data-testid={`selector-value-input-${index}`}
                        value={rule.selectorValue}
                        onChange={(e) =>
                          updateRule(rule.id, {
                            selectorValue: e.target.value,
                          })
                        }
                        placeholder={`Enter ${rule.selectorType} match`}
                        className="flex-1 border-gray-300 focus:border-gray-500 focus:ring-gray-500"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Permission Mode */}
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-gray-700">Operations</Label>
                  <div className="inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-600">
                    <button
                      type="button"
                      onClick={() => handlePermissionModeChange(rule.id, ModeCustom)}
                      data-testid={`mode-custom-button-${index}`}
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
                        rule.mode === ModeCustom
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      Custom
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePermissionModeChange(rule.id, ModeAllowAll)}
                      data-testid={`mode-allow-all-button-${index}`}
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
                        rule.mode === ModeAllowAll
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      Allow all
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePermissionModeChange(rule.id, ModeDenyAll)}
                      data-testid={`mode-deny-all-button-${index}`}
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
                        rule.mode === ModeDenyAll
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      Deny all
                    </button>
                  </div>
                </div>
              </div>

              {/* Operations */}
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(rule.operations).map(([operation, operationValue]) => (
                  <div key={operation} className="flex items-center gap-1">
                    <Select
                      value={operationValue}
                      onValueChange={(value) => handleOperationChange(rule.id, operation, value)}
                      disabled={false}
                    >
                      <SelectTrigger
                        data-testid={`operation-select-${operation}`}
                        className="flex-1 h-10 border-gray-300 justify-between focus:border-gray-500 focus:ring-gray-500/20"
                      >
                        <div className="flex items-center space-x-2">
                          {getPermissionIcon(operationValue)}
                          <span
                            className={`text-sm font-medium ${operationValue === OperationTypeNotSet ? 'text-gray-400' : 'text-gray-900'}`}
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
                            <Circle className="w-4 h-4 text-gray-400" />
                            <span>Not set</span>
                          </div>
                        </SelectItem>
                        <SelectItem
                          data-testid={`ro-${getIdFromRule(rule, operation, OperationTypeAllow)}`}
                          value={OperationTypeAllow}
                        >
                          <div className="flex items-center space-x-2">
                            <Check className="w-4 h-4 text-green-600" />
                            <span>Allow</span>
                          </div>
                        </SelectItem>
                        <SelectItem
                          data-testid={`ro-${getIdFromRule(rule, operation, OperationTypeDeny)}`}
                          value={OperationTypeDeny}
                        >
                          <div className="flex items-center space-x-2">
                            <X className="w-4 h-4 text-red-600" />
                            <span>Deny</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{getPermissionDescription(operation, rule.resourceType)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add Rule Button */}
        <div className="mt-6">
          <Button onClick={addRule} variant="secondary" className="w-full" data-testid="add-acl-rule-button">
            <Plus className="w-4 h-4" />
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
}: SharedConfigProps & { principalType?: PrincipalType }) => {
  const [principalType, setPrincipalType] = useState(
    propPrincipalType ? propPrincipalType.replace(':', '') : sharedConfig.principal.split(':')[0] || RoleTypeUser,
  );
  const [hostType, setHostType] = useState<HostType>(stringToHostType(sharedConfig.host));

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-medium text-gray-900">Shared configuration</CardTitle>
        <CardDescription className="text-gray-600">These settings apply to all rules.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="principal" className="text-sm font-medium text-gray-700">
                User / principal
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
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
            </div>
            <div className="flex gap-3">
              <Select
                value={principalType}
                onValueChange={(value) => {
                  setPrincipalType(value);
                  // Update the principal to include the new type
                  const currentValue = sharedConfig.principal.split(':')[1] || '';
                  setSharedConfig({
                    ...sharedConfig,
                    principal: `${value}:${currentValue}`,
                  });
                }}
                disabled={edit}
              >
                <SelectTrigger
                  className="w-36 focus:border-gray-500 focus:ring-gray-500/20"
                  data-testid="shared-principal-type-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RoleTypeUser}>User</SelectItem>
                  <SelectItem value={RoleTypeRedpandaRole}>Redpanda role</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="principal"
                value={sharedConfig.principal.replace(/^[^:]+:/, '')}
                onChange={(e) =>
                  setSharedConfig({
                    ...sharedConfig,
                    principal: `${principalType}:${e.target.value}`,
                  })
                }
                className="flex-1 border-gray-300 focus:border-gray-500 focus:ring-gray-500"
                placeholder="analytics-writer"
                data-testid="shared-principal-input"
                disabled={edit}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="host" className="text-sm font-medium text-gray-700">
                Host
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    The IP address or hostname from which the user is allowed or denied access. Use * to allow from any
                    host.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex gap-3">
              <Select
                value={hostType}
                onValueChange={(value) => {
                  setHostType(value as HostType);
                  if (value === HostTypeAllowAllHosts) {
                    setSharedConfig({
                      ...sharedConfig,
                      host: '*',
                    });
                  }
                }}
                disabled={edit}
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
                  id="host"
                  value={sharedConfig.host === '*' ? '' : sharedConfig.host}
                  onChange={(e) =>
                    setSharedConfig({
                      ...sharedConfig,
                      host: e.target.value,
                    })
                  }
                  className="flex-1 border-gray-300 focus:border-gray-500 focus:ring-gray-500"
                  placeholder="1.1.1.1"
                  disabled={edit}
                  data-testid="shared-host-input"
                />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface CreateACLProps {
  onSubmit?: (principal: string, host: string, rules: Rule[]) => Promise<void>;
  onCancel: () => void;
  rules?: Rule[];
  sharedConfig?: SharedConfig;
  edit: boolean;
  principalType?: PrincipalType;
}

export default function CreateACL({
  onSubmit,
  onCancel,
  rules: propRules,
  sharedConfig: propSharedConfig,
  edit,
  principalType,
}: CreateACLProps) {
  const schemaRegistryEnabled = true;

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
    ],
  );

  const addRule = () => {
    // Determine the default resource type for new rules
    let defaultResourceType = ResourceTypeCluster;
    if (hasClusterRule()) {
      defaultResourceType = hasSubjectRule() ? ResourceTypeTopic : ResourceTypeSubject;
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
      ResourceTypeSubject,
      ResourceTypeSchemaRegistry,
    ];

    const newRules: Rule[] = [];

    // Check which resource types don't already exist
    const existingResourceTypes = rules.map((rule) => rule.resourceType);

    resourceTypes.forEach((resourceType, index) => {
      // TODO: Move has operation to one function
      // Skip cluster if it already exists (since only one cluster rule allowed)
      if (resourceType === ResourceTypeCluster && hasClusterRule()) {
        return;
      }

      // Skip schema registry if it already exists (since only one schema registry rule allowed)
      if (resourceType === ResourceTypeSchemaRegistry && hasSchemaRegistryRule()) {
        return;
      }

      // Skip subject if it already exists (since only one subject rule allowed)
      if (resourceType === ResourceTypeSubject && hasSubjectRule()) {
        return;
      }

      // Skip if resource type already exists
      if (existingResourceTypes.includes(resourceType)) {
        return;
      }

      const operations = getOperationsForResourceType(resourceType);
      const allowAllOperations = Object.fromEntries(Object.entries(operations).map(([op]) => [op, OperationTypeAllow]));

      newRules.push({
        id: Date.now() + index,
        resourceType,
        mode: ModeAllowAll,
        selectorType: ResourcePatternTypeAny,
        selectorValue: '',
        operations: allowAllOperations,
      });
    });

    setRules([...rules, ...newRules]);
  };

  const removeRule = (id: number) => {
    setRules(rules.filter((rule) => rule.id !== id));
  };

  const updateRule = (id: number, updates: any) => {
    setRules(rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  };

  const handleResourceTypeChange = (ruleId: number, resourceType: ResourceType) => {
    updateRule(ruleId, {
      resourceType,
      selectorType: ResourcePatternTypeAny,
      selectorValue: '',
      operations: getOperationsForResourceType(resourceType),
    });
  };

  const hasClusterRule = () => {
    return rules.some((rule) => rule.resourceType === ResourceTypeCluster);
  };

  const isClusterDisabledForRule = (ruleId: number) => {
    const currentRule = rules.find((rule) => rule.id === ruleId);
    if (!currentRule) return false;

    // If current rule is already cluster, don't disable it
    if (currentRule.resourceType === ResourceTypeCluster) return false;

    // If there's already a cluster rule, disable cluster for this rule
    return hasClusterRule();
  };

  const hasSubjectRule = () => {
    return rules.some((rule) => rule.resourceType === ResourceTypeSubject);
  };

  const hasSchemaRegistryRule = () => {
    return rules.some((rule) => rule.resourceType === ResourceTypeSchemaRegistry);
  };

  const isSchemaRegistryDisabledForRule = (ruleId: number) => {
    const currentRule = rules.find((rule) => rule.id === ruleId);
    if (!currentRule) return false;

    // If Schema Registry is not enabled, disable it for all rules except existing schema registry rules
    if (!schemaRegistryEnabled && currentRule.resourceType !== ResourceTypeSchemaRegistry) {
      return true;
    }

    // If current rule is already schemaRegistry, don't disable it
    if (currentRule.resourceType === ResourceTypeSchemaRegistry) return false;

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
    if (!currentRule) return false;

    // If current rule is already subject, don't disable it
    if (currentRule.resourceType === ResourceTypeSubject) return false;

    // If schema registry is not enabled, disable subject
    if (!schemaRegistryEnabled) return true;

    // If there's already a subject rule, disable subject for this rule
    return hasSubjectRule();
  };

  const handlePermissionModeChange = (ruleId: number, mode: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;

    const updatedOperations = Object.fromEntries(
      Object.entries(rule.operations).map(([op, operationValue]) => [
        op,
        mode === ModeAllowAll ? OperationTypeAllow : mode === ModeDenyAll ? OperationTypeDeny : operationValue,
      ]),
    );

    updateRule(ruleId, { mode, operations: updatedOperations });
  };

  const handleOperationChange = (ruleId: number, operation: string, value: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;

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
        return <Check className="w-4 h-4 text-green-600" />;
      case OperationTypeDeny:
        return <X className="w-4 h-4 text-red-600" />;
      default:
        return <Circle className="w-4 h-4 text-gray-400" />;
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
    if (!desc) return 'Permission description not available';
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

  // Helper to get the title based on principal type
  const getTitle = () => {
    const entityType = sharedConfig.principal.split(':')[0] === 'RedpandaRole' ? 'Role' : 'ACL';
    return edit ? `Edit ${entityType}` : `Create ${entityType}`;
  };
  return (
    <div>
      {/* Page Header - Sticky */}
      <div className="sticky top-[49px] z-10 from-70% to-transparent">
        <div className="pt-7 px-6 pb-4">
          <div className="mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{getTitle()}</h1>
                <p className="text-sm text-gray-600">Configure access control rules for your Kafka resources</p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" className="text-gray-700 border-gray-300" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  data-testid="submit-acl-button"
                  className="bg-gray-900 hover:bg-gray-800 text-white"
                  onClick={() => {
                    onSubmit?.(sharedConfig.principal, sharedConfig.host, rules);
                  }}
                >
                  {edit ? 'Save' : 'Create'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="pt-3 px-6 pb-6">
        <div className="mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Main Form */}
            <div className="lg:col-span-2 space-y-6">
              <SharedConfiguration
                sharedConfig={sharedConfig}
                setSharedConfig={setSharedConfig}
                openMatchingSections={openMatchingSections}
                setOpenMatchingSections={setOpenMatchingSections}
                getSectionKey={getSectionKey}
                edit={edit}
                principalType={principalType}
              />

              <AclRules
                rules={rules}
                addRule={addRule}
                addAllowAllOperations={addAllowAllOperations}
                removeRule={removeRule}
                updateRule={updateRule}
                handleResourceTypeChange={handleResourceTypeChange}
                isClusterDisabledForRule={isClusterDisabledForRule}
                isSchemaRegistryDisabledForRule={isSchemaRegistryDisabledForRule}
                getSchemaRegistryTooltipText={getSchemaRegistryTooltipText}
                getSubjectTooltipText={getSubjectTooltipText}
                isSubjectDisabledForRule={isSubjectDisabledForRule}
                handlePermissionModeChange={handlePermissionModeChange}
                handleOperationChange={handleOperationChange}
                getPermissionIcon={getPermissionIcon}
                getPermissionDescription={getPermissionDescription}
                openMatchingSections={openMatchingSections}
                setOpenMatchingSections={setOpenMatchingSections}
                getSectionKey={getSectionKey}
              />
            </div>

            {/* Right Column - Summary Card */}
            <div className="lg:col-span-1">
              <div className="sticky top-36">
                <Summary sharedConfig={sharedConfig} rules={rules} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
