/** biome-ignore-all lint/correctness/useUniqueElementIds: this is intentional for form usage */

import clsx from 'clsx';
import { TonedIcon } from 'components/pages/shared/toned-icon';
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
import { FieldTitle } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Check, Circle, HelpCircle, Plus, Trash2, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useSupportedFeaturesStore } from 'state/supported-features';

import {
  getPermissionDescription,
  getSchemaRegistryTooltipText,
  getSubjectTooltipText,
  hasConfiguredOperation,
} from './acl-rule-editing';
import { useAclRulesEditor } from '../hooks/use-acl-rules-editor';
import { useAclSharedConfig } from '../hooks/use-acl-shared-config';
import { useGbacEnabled } from '../hooks/use-gbac-enabled';
import {
  type AclRulesProps,
  getIdFromRule,
  getRuleDataTestId,
  type HostType,
  HostTypeAllowAllHosts,
  HostTypeSpecificHost,
  ModeAllowAll,
  ModeCustom,
  ModeDenyAll,
  OperationTypeAllow,
  OperationTypeDeny,
  OperationTypeNotSet,
  type PrincipalFieldProps,
  type PrincipalType,
  parsePrincipal,
  type ResourcePatternType,
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
  RoleTypeGroup,
  RoleTypeRedpandaRole,
  RoleTypeUser,
  type Rule,
  type SharedConfig,
  type SharedConfigProps,
  type SummaryProps,
} from '../shared/acl-model';

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

// Helper function to format summary labels, keeping certain words capitalized
export const formatSummaryLabel = (text: string): string => {
  return text.replace('id', 'ID'); // transactional ids => transactional IDs
};

// Helper function to get resource name for selector label
const getResourceName = (resourceType: ResourceType): string => {
  const resourceNames: Record<string, string> = {
    [ResourceTypeTopic]: 'Topic',
    [ResourceTypeConsumerGroup]: 'Consumer group',
    [ResourceTypeTransactionalId]: 'Transactional ID',
    [ResourceTypeSubject]: 'Subject',
    [ResourceTypeSchemaRegistry]: 'Schema Registry',
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

const getRuleSelectorSummary = (rule: Rule): string => {
  if (rule.resourceType === ResourceTypeCluster || rule.resourceType === ResourceTypeSchemaRegistry) {
    return getResourceName(rule.resourceType);
  }
  if (rule.selectorType === ResourcePatternTypeAny) {
    return `All ${getPluralResourceName(rule.resourceType)}`;
  }
  const matchType = rule.selectorType === ResourcePatternTypeLiteral ? 'matching' : 'starting with';
  return `${getPluralResourceName(rule.resourceType)} ${matchType}: "${rule.selectorValue}"`;
};

const getRuleSummaryTitle = (rule: Rule): string => formatSummaryLabel(getRuleSelectorSummary(rule));

function stringToHostType(h: string): HostType {
  switch (h) {
    case '*':
    case '':
      return HostTypeAllowAllHosts;
    default:
      return HostTypeSpecificHost;
  }
}

const PermissionIcon = ({ value }: { value: string }) => {
  switch (value) {
    case OperationTypeAllow:
      return <TonedIcon className="h-4 w-4" icon={Check} tone="success" />;
    case OperationTypeDeny:
      return <TonedIcon className="h-4 w-4" icon={X} tone="destructive" />;
    default:
      return <TonedIcon className="h-4 w-4" icon={Circle} tone="disabled" />;
  }
};

// Descriptions hold one API list per line.
const PermissionDescription = ({ operation, resourceType }: { operation: string; resourceType: string }) => {
  const description = getPermissionDescription(operation, resourceType);
  if (!description) {
    return 'Permission description not available';
  }
  return description.split('\n').map((line) => (
    <span key={line}>
      {line}
      <br />
    </span>
  ));
};

const FieldHelp = ({ children, contentClassName }: { children: ReactNode; contentClassName?: string }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex cursor-help text-disabled" />}>
        <HelpCircle className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent className={contentClassName}>{children}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const ResourceTypeSelection = ({
  rule,
  handleResourceTypeChange,
  isClusterDisabledForRule,
  isSchemaRegistryDisabledForRule,
  isSchemaRegistryEnabled,
  ruleIndex,
  labelId,
}: ResourceTypeSelectionProps & { labelId: string }) => {
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
      tooltipText: getSubjectTooltipText(isSchemaRegistryEnabled),
    },
    {
      name: 'Schema Registry',
      resourceType: ResourceTypeSchemaRegistry,
      disabled: !isSchemaRegistryEnabled || isSchemaRegistryDisabledForRule(rule.id),
      tooltipText: getSchemaRegistryTooltipText(isSchemaRegistryEnabled),
    },
  ];

  return (
    <span className="h-10 items-center justify-center rounded-md bg-surface-subtle p-1 text-subtle md:inline-flex">
      <ToggleGroup
        aria-labelledby={labelId}
        onValueChange={(values: string[]) => {
          const [resourceType] = values;
          if (resourceType) {
            handleResourceTypeChange(rule.id, resourceType as ResourceType);
          }
        }}
        size="sm"
        value={[rule.resourceType]}
      >
        {buttons.map(({ name, resourceType, disabled, tooltipText }) => (
          <TooltipProvider key={`rt-${resourceType}-tooltip-${ruleIndex}`}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToggleGroupItem
                    data-testid={`rt-${resourceType}-button-${ruleIndex}`}
                    disabled={disabled}
                    value={resourceType}
                  >
                    {name}
                  </ToggleGroupItem>
                }
              />
              <TooltipContent hidden={!disabled}>
                <p className="max-w-xs">{tooltipText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </ToggleGroup>
    </span>
  );
};

const Summary = ({ sharedConfig, rules }: SummaryProps) => {
  return (
    <Card size="full">
      <CardHeader>
        <h3>Summary</h3>
      </CardHeader>
      <CardContent>
        {/* Shared Configuration Summary */}
        <div>
          <div className="rounded-lg border-0">
            <div className="flex items-center justify-between text-body">
              <span className="text-subtle">Principal:</span>
              <span className="font-medium text-strong">{sharedConfig.principal.replace(COLON_REGEX, ': ')}</span>
            </div>
            <div className="flex items-center justify-between text-body">
              <span className="text-subtle">Host:</span>
              <span className="font-medium text-strong">
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
                className="space-y-2 rounded-lg border border-border bg-card/40 p-3"
                data-testid={`summary-card-${getRuleDataTestId(rule)}`}
                key={rule.id}
              >
                {/* Combined Resource and Selector */}
                <p
                  className="text-body-sm text-subtle first-letter:uppercase"
                  data-testid={`${getRuleDataTestId(rule)}-title`}
                >
                  {getRuleSummaryTitle(rule)}
                </p>

                {/* Operations */}
                <div>
                  {enabledOperations.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {showSummary ? (
                        <span
                          className={clsx(
                            'inline-flex items-center rounded-full px-2 py-1 text-body-sm font-medium',
                            allAllow ? 'bg-success-wash text-success' : 'bg-destructive-wash text-destructive'
                          )}
                        >
                          {allAllow ? 'Allow all' : 'Deny all'}
                        </span>
                      ) : (
                        enabledOperations.map((op) => (
                          <span
                            className={clsx(
                              'inline-flex items-center rounded-full px-2 py-1 text-body-sm font-medium',
                              op.value === OperationTypeAllow
                                ? 'bg-success-wash text-success'
                                : 'bg-destructive-wash text-destructive'
                            )}
                            data-testid={`${getRuleDataTestId(rule)}-op-${op.originalOperationName}`}
                            key={op.name}
                          >
                            {op.name}: {op.value}
                          </span>
                        ))
                      )}
                    </div>
                  ) : (
                    <span className="text-body-sm text-disabled italic">No operations configured</span>
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
  handlePermissionModeChange,
  handleOperationChange,
  schemaRegistryEnabled,
}: AclRulesProps) => {
  const labelIdPrefix = useId();

  return (
    <Card size={'full'}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle level={3}>ACL rules</CardTitle>
            <CardDescription>Configure permissions for different resource types.</CardDescription>
          </div>
          <Button data-testid="add-allow-all-operations-button" onClick={addAllowAllOperations} variant="outline">
            Allow all operations
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rules.map((rule, index) => (
          <Card
            data-testid={`card-content-rule-${getRuleDataTestId(rule)}`}
            key={rule.id}
            size={'full'}
            variant={'elevated'}
          >
            <CardContent>
              {/* Resource Type Selection */}
              <div className="flex items-center justify-between">
                <div>
                  <FieldTitle className="mb-1.5" id={`${labelIdPrefix}-${rule.id}-resource-type`}>
                    Select a resource type
                  </FieldTitle>
                  <ResourceTypeSelection
                    handleResourceTypeChange={handleResourceTypeChange}
                    isClusterDisabledForRule={isClusterDisabledForRule}
                    isSchemaRegistryDisabledForRule={isSchemaRegistryDisabledForRule}
                    isSchemaRegistryEnabled={schemaRegistryEnabled}
                    isSubjectDisabledForRule={isSubjectDisabledForRule}
                    labelId={`${labelIdPrefix}-${rule.id}-resource-type`}
                    rule={rule}
                    ruleIndex={index}
                  />
                </div>
                <Button
                  data-testid={`remove-rule-button-${getRuleDataTestId(rule)}`}
                  onClick={() => removeRule(rule.id)}
                  size="icon"
                  variant="destructive-ghost"
                >
                  <Trash2 />
                </Button>
              </div>

              {/* Resource Name Selector */}
              {/* Show selector if resource type is not Cluster or SchemaRegistry */}
              {!(rule.resourceType === ResourceTypeCluster || rule.resourceType === ResourceTypeSchemaRegistry) && (
                <fieldset aria-labelledby={`${labelIdPrefix}-${rule.id}-selector`} className="mb-6 space-y-2">
                  <FieldTitle id={`${labelIdPrefix}-${rule.id}-selector`}>Selector</FieldTitle>
                  <div className="grid grid-cols-4 gap-3">
                    <Select
                      items={{
                        [ResourcePatternTypeAny]: `All ${getPluralResourceName(rule.resourceType)}`,
                        [ResourcePatternTypeLiteral]: `${getResourceName(rule.resourceType)} names matching`,
                        [ResourcePatternTypePrefix]: `${getResourceName(rule.resourceType)} names starting with`,
                      }}
                      onValueChange={(value) =>
                        updateRule(rule.id, {
                          selectorType: value as ResourcePatternType,
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
                          className="flex-1"
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
                          className={clsx('text-body text-destructive', !!rule.selectorValue.length && 'hidden')}
                          data-testid={`selector-value-error-${index}`}
                        >
                          {rule.selectorType === ResourcePatternTypeLiteral
                            ? 'Literal match cannot be empty'
                            : 'Prefix match cannot be empty'}
                        </p>
                      </div>
                    )}
                  </div>
                </fieldset>
              )}

              {/* Permission Mode */}
              <fieldset aria-labelledby={`${labelIdPrefix}-${rule.id}-operations`}>
                <div className="mb-3 flex items-center justify-between">
                  <FieldTitle id={`${labelIdPrefix}-${rule.id}-operations`}>Operations</FieldTitle>
                  <div className="inline-flex h-10 items-center justify-center rounded-md bg-surface-subtle p-1 text-subtle">
                    <button
                      className={clsx(
                        'inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-body font-medium whitespace-nowrap ring-offset-white transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                        rule.mode === ModeCustom
                          ? 'bg-background text-strong shadow-sm'
                          : 'text-subtle hover:bg-accent hover:text-strong'
                      )}
                      data-testid={`mode-custom-button-${index}`}
                      onClick={() => handlePermissionModeChange(rule.id, ModeCustom)}
                      type="button"
                    >
                      Custom
                    </button>
                    <button
                      className={clsx(
                        'inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-body font-medium whitespace-nowrap ring-offset-white transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                        rule.mode === ModeAllowAll
                          ? 'bg-background text-strong shadow-sm'
                          : 'text-subtle hover:bg-accent hover:text-strong'
                      )}
                      data-testid={`mode-allow-all-button-${index}`}
                      onClick={() => handlePermissionModeChange(rule.id, ModeAllowAll)}
                      type="button"
                    >
                      Allow all
                    </button>
                    <button
                      className={clsx(
                        'inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-body font-medium whitespace-nowrap ring-offset-white transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                        rule.mode === ModeDenyAll
                          ? 'bg-background text-strong shadow-sm'
                          : 'text-subtle hover:bg-accent hover:text-strong'
                      )}
                      data-testid={`mode-deny-all-button-${index}`}
                      onClick={() => handlePermissionModeChange(rule.id, ModeDenyAll)}
                      type="button"
                    >
                      Deny all
                    </button>
                  </div>
                </div>

                {/* Operations */}
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {Object.entries(rule.operations).map(([operation, operationValue]) => (
                    <div className="flex items-center gap-1" key={operation}>
                      <Select
                        onValueChange={(value) => handleOperationChange(rule.id, operation, value)}
                        value={operationValue}
                      >
                        <SelectTrigger
                          className="flex-1 justify-between"
                          data-testid={`operation-select-${operation}`}
                          size="lg"
                        >
                          <div className="flex items-center space-x-2">
                            <PermissionIcon value={operationValue} />
                            <span
                              className={clsx(
                                'text-body font-medium',
                                operationValue === OperationTypeNotSet ? 'text-disabled' : 'text-strong'
                              )}
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
                              <PermissionIcon value={OperationTypeNotSet} />
                              <span>Not set</span>
                            </div>
                          </SelectItem>
                          <SelectItem
                            data-testid={`ro-${getIdFromRule(rule, operation, OperationTypeAllow)}`}
                            value={OperationTypeAllow}
                          >
                            <div className="flex items-center space-x-2">
                              <PermissionIcon value={OperationTypeAllow} />
                              <span>Allow</span>
                            </div>
                          </SelectItem>
                          <SelectItem
                            data-testid={`ro-${getIdFromRule(rule, operation, OperationTypeDeny)}`}
                            value={OperationTypeDeny}
                          >
                            <div className="flex items-center space-x-2">
                              <PermissionIcon value={OperationTypeDeny} />
                              <span>Deny</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldHelp>
                        <p className="max-w-xs">
                          <PermissionDescription operation={operation} resourceType={rule.resourceType} />
                        </p>
                      </FieldHelp>
                    </div>
                  ))}
                </div>
              </fieldset>
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
  renderPrincipal,
}: SharedConfigProps & {
  principalType?: PrincipalType;
  principalError?: string;
  renderPrincipal?: (props: PrincipalFieldProps) => ReactNode;
}) => {
  const [principalType, setPrincipalType] = useState(
    propPrincipalType ? propPrincipalType.replace(':', '') : parsePrincipal(sharedConfig.principal).type || RoleTypeUser
  );
  const [hostType, setHostType] = useState<HostType>(() => stringToHostType(sharedConfig.host));
  const gbacEnabled = useGbacEnabled();

  return (
    <Card size={'full'}>
      <CardHeader>
        <CardTitle level={3}>Shared configuration</CardTitle>
        <CardDescription>These settings apply to all rules.</CardDescription>
      </CardHeader>
      <CardContent>
        <CardForm>
          {renderPrincipal ? (
            renderPrincipal({
              value: sharedConfig.principal,
              onChange: (principal) => setSharedConfig({ ...sharedConfig, principal }),
              disabled: edit,
              error: principalError,
            })
          ) : (
            <CardField>
              <div className="flex items-center gap-1">
                <Label htmlFor="principal">
                  {principalType === RoleTypeRedpandaRole ? 'Role name' : 'User / principal'}
                </Label>
                <FieldHelp contentClassName="max-w-xs">
                  <div>
                    <p>
                      The user getting permissions granted or denied. In Kafka, this user is known as the principal.
                    </p>
                    <ul className="mt-2 space-y-1 text-body">
                      <li>• Use the wildcard * to target all users.</li>
                      <li>• Do not include the prefix. For example, use my-user instead of User:my-user.</li>
                    </ul>
                  </div>
                </FieldHelp>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <Select
                  disabled={edit}
                  items={{
                    [RoleTypeUser]: 'User',
                    [RoleTypeGroup]: 'Group',
                    [RoleTypeRedpandaRole]: 'Redpanda role',
                  }}
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
                    {gbacEnabled && <SelectItem value={RoleTypeGroup}>Group</SelectItem>}
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
                  {Boolean(principalError) && (
                    <p className="text-body text-destructive" data-testid="principal-error">
                      {principalError}
                    </p>
                  )}
                </div>
              </div>
            </CardField>
          )}
        </CardForm>
        <br />

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="host">Host</Label>
              <FieldHelp contentClassName="max-w-xs">
                <p>
                  The IP address or hostname from which the user is allowed or denied access. Use * to allow from any
                  host.
                </p>
              </FieldHelp>
            </div>
            <div className="flex gap-3">
              <Select
                disabled={edit}
                items={{
                  [HostTypeAllowAllHosts]: 'Allow all hosts',
                  [HostTypeSpecificHost]: 'Specific IP addresses',
                }}
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
                <SelectTrigger className="w-48" data-testid="shared-host-button">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HostTypeAllowAllHosts}>Allow all hosts</SelectItem>
                  <SelectItem value={HostTypeSpecificHost}>Specific IP addresses</SelectItem>
                </SelectContent>
              </Select>
              {hostType === HostTypeSpecificHost && (
                <Input
                  className="flex-1"
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
  renderPrincipal?: (props: PrincipalFieldProps) => ReactNode;
};

export default function CreateACL({
  onSubmit,
  onCancel,
  rules: propRules,
  sharedConfig: propSharedConfig,
  edit,
  principalType,
  renderPrincipal,
}: CreateACLProps) {
  const schemaRegistryEnabled = useSupportedFeaturesStore((s) => s.schemaRegistryACLApi);
  const { sharedConfig, setSharedConfig, principalError, submitIfPrincipalNamed } = useAclSharedConfig(
    propSharedConfig,
    principalType
  );
  const rulesEditor = useAclRulesEditor(propRules, schemaRegistryEnabled);
  const { rules } = rulesEditor;

  return (
    <div className="relative min-h-screen pb-20">
      {/* Main Content */}
      <main className="pb-6">
        <div className="mx-auto">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Left Column - Main Form */}
            <div className="space-y-6 lg:col-span-2">
              <p className="h-12 text-body text-subtle">Configure access control rules for your Kafka resources.</p>

              <SharedConfiguration
                edit={edit}
                principalError={principalError}
                principalType={principalType}
                renderPrincipal={renderPrincipal}
                setSharedConfig={setSharedConfig}
                sharedConfig={sharedConfig}
              />

              <AclRules {...rulesEditor} schemaRegistryEnabled={schemaRegistryEnabled} />
            </div>

            {/* Right Column - Summary Card */}
            <div className="lg:col-span-1">
              <div className="sticky top-20">
                <Summary rules={rules} sharedConfig={sharedConfig} />
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    data-testid="submit-acl-button"
                    disabled={!!principalError || !hasConfiguredOperation(rules)}
                    onClick={() =>
                      submitIfPrincipalNamed(() => onSubmit?.(sharedConfig.principal, sharedConfig.host, rules))
                    }
                  >
                    {edit ? 'Save' : 'Create'}
                  </Button>
                  <Button onClick={onCancel} variant="ghost">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
