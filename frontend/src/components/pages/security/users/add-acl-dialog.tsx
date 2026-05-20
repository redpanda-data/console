/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { BadRequestSchema } from 'protogen/google/rpc/error_details_pb';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  CreateACLRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useCreateACLMutation } from '../../../../react-query/api/acl';
import { useListUsersQuery } from '../../../../react-query/api/user';
import { api } from '../../../../state/backend-api';
import { Alert, AlertDescription } from '../../../redpanda-ui/components/alert';
import { Button } from '../../../redpanda-ui/components/button';
import { Combobox } from '../../../redpanda-ui/components/combobox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../redpanda-ui/components/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../redpanda-ui/components/form';
import { Input } from '../../../redpanda-ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../redpanda-ui/components/select';
import { InlineCode, Text } from '../../../redpanda-ui/components/typography';

const schema = z.object({
  principal: z.string().min(1, 'Principal is required'),
  resourceType: z.nativeEnum(ACL_ResourceType),
  patternType: z.nativeEnum(ACL_ResourcePatternType),
  resourceName: z.string(),
  operation: z.nativeEnum(ACL_Operation),
  permissionType: z.nativeEnum(ACL_PermissionType),
  host: z.string(),
});

type FormValues = z.infer<typeof schema>;

const FORM_FIELD_NAMES = new Set<string>(Object.keys(schema.shape));

const BASE_resourceTypeOptions = [
  { value: ACL_ResourceType.TOPIC, label: 'Topic' },
  { value: ACL_ResourceType.GROUP, label: 'Consumer Group' },
  { value: ACL_ResourceType.CLUSTER, label: 'Cluster' },
  { value: ACL_ResourceType.TRANSACTIONAL_ID, label: 'Transactional ID' },
];

const REDPANDA_resourceTypeOptions = [
  { value: ACL_ResourceType.SUBJECT, label: 'Subject' },
  { value: ACL_ResourceType.REGISTRY, label: 'Schema Registry' },
];

const OPERATION_OPTIONS = [
  { value: ACL_Operation.ALL, label: 'All' },
  { value: ACL_Operation.READ, label: 'Read' },
  { value: ACL_Operation.WRITE, label: 'Write' },
  { value: ACL_Operation.CREATE, label: 'Create' },
  { value: ACL_Operation.DELETE, label: 'Delete' },
  { value: ACL_Operation.ALTER, label: 'Alter' },
  { value: ACL_Operation.DESCRIBE, label: 'Describe' },
  { value: ACL_Operation.DESCRIBE_CONFIGS, label: 'Describe Configs' },
  { value: ACL_Operation.ALTER_CONFIGS, label: 'Alter Configs' },
  { value: ACL_Operation.IDEMPOTENT_WRITE, label: 'Idempotent Write' },
  { value: ACL_Operation.CLUSTER_ACTION, label: 'Cluster Action' },
];

const PATTERN_TYPE_HELP: Partial<Record<ACL_ResourcePatternType, string>> = {
  [ACL_ResourcePatternType.LITERAL]: 'Matches the exact resource name.',
  [ACL_ResourcePatternType.PREFIXED]: 'Matches any resource name starting with this prefix.',
  [ACL_ResourcePatternType.ANY]: 'Matches any resource name.',
};

type AddAclDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the principal selector is hidden and this value is used directly. */
  principal?: string;
};

export const AddAclDialog = ({ open, onOpenChange, principal }: AddAclDialogProps) => {
  const { mutateAsync: createACL, isPending } = useCreateACLMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [principalType, setPrincipalType] = useState<'User' | 'Group'>('User');
  const [principalValue, setPrincipalValue] = useState('');

  const { data: usersData } = useListUsersQuery(undefined, { enabled: !principal });
  const userOptions = (usersData?.users ?? []).map((u) => ({ value: u.name, label: u.name }));

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      principal: principal ?? '',
      resourceType: ACL_ResourceType.TOPIC,
      patternType: ACL_ResourcePatternType.LITERAL,
      resourceName: '',
      operation: ACL_Operation.ALL,
      permissionType: ACL_PermissionType.ALLOW,
      host: '*',
    },
  });

  const resourceType = useWatch({ control: form.control, name: 'resourceType' });
  const patternType = useWatch({ control: form.control, name: 'patternType' });

  const resourceTypeOptions = api.isRedpanda
    ? [...BASE_resourceTypeOptions, ...REDPANDA_resourceTypeOptions]
    : BASE_resourceTypeOptions;

  const showPatternAndName = resourceType !== ACL_ResourceType.CLUSTER && resourceType !== ACL_ResourceType.REGISTRY;

  const showResourceName =
    showPatternAndName &&
    (patternType === ACL_ResourcePatternType.LITERAL || patternType === ACL_ResourcePatternType.PREFIXED);

  const resetPrincipalSelector = () => {
    setPrincipalType('User');
    setPrincipalValue('');
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);
    form.clearErrors();
    // When principal is pre-set via prop its field isn't rendered, so server violations
    // on it must go to the global alert rather than being silently dropped.
    const renderableFieldNames = principal
      ? new Set([...FORM_FIELD_NAMES].filter((f) => f !== 'principal'))
      : FORM_FIELD_NAMES;
    try {
      // ANY is a query-only pattern type; translate it to LITERAL with wildcard name
      const isAny = values.patternType === ACL_ResourcePatternType.ANY;
      await createACL(
        create(CreateACLRequestSchema, {
          resourceType: values.resourceType,
          resourceName:
            values.resourceType === ACL_ResourceType.CLUSTER
              ? 'kafka-cluster'
              : isAny
                ? '*'
                : values.resourceName || '*',
          resourcePatternType: isAny ? ACL_ResourcePatternType.LITERAL : values.patternType,
          principal: values.principal,
          host: values.host || '*',
          operation: values.operation,
          permissionType: values.permissionType,
        })
      );
      onOpenChange(false);
      form.reset();
      if (!principal) resetPrincipalSelector();
    } catch (err) {
      if (err instanceof ConnectError) {
        const globalMessages: string[] = [];
        let hasFieldError = false;

        for (const badRequest of err.findDetails(BadRequestSchema)) {
          for (const violation of badRequest.fieldViolations) {
            if (violation.field && renderableFieldNames.has(violation.field)) {
              form.setError(violation.field as keyof FormValues, {
                type: 'server',
                message: violation.description,
              });
              hasFieldError = true;
            } else {
              globalMessages.push(
                violation.field ? `${violation.field}: ${violation.description}` : violation.description
              );
            }
          }
        }

        if (globalMessages.length > 0) {
          setSubmitError(globalMessages.join('\n'));
        } else if (!hasFieldError) {
          setSubmitError(err.rawMessage);
        }
      } else {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleClose = () => {
    setSubmitError(null);
    onOpenChange(false);
    form.reset();
    if (!principal) resetPrincipalSelector();
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add ACL</DialogTitle>
          {principal && <DialogDescription>Define a new access control rule for {principal}.</DialogDescription>}
        </DialogHeader>

        <DialogBody>
          <Form {...form}>
            <form id="add-acl-form" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="space-y-4 py-2">
                {!principal && (
                  <FormField
                    control={form.control}
                    name="principal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Principal</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Select
                              onValueChange={(v) => {
                                setPrincipalType(v as 'User' | 'Group');
                                setPrincipalValue('');
                                field.onChange('');
                              }}
                              value={principalType}
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="User">User</SelectItem>
                                <SelectItem value="Group">Group</SelectItem>
                              </SelectContent>
                            </Select>
                            {principalType === 'User' ? (
                              <Combobox
                                className="flex-1"
                                clearable={false}
                                creatable
                                createLabel="user"
                                onChange={(v) => {
                                  setPrincipalValue(v);
                                  field.onChange(v ? `${principalType}:${v}` : '');
                                }}
                                options={userOptions}
                                placeholder="Select or type a user..."
                                value={principalValue}
                              />
                            ) : (
                              <Input
                                // biome-ignore lint/a11y/noAutofocus: auto-focus after switching type so the user can type immediately
                                autoFocus
                                className="flex-1"
                                onChange={(e) => {
                                  setPrincipalValue(e.target.value);
                                  field.onChange(e.target.value ? `${principalType}:${e.target.value}` : '');
                                }}
                                placeholder="Enter group name..."
                                value={principalValue}
                              />
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="resourceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resource Type</FormLabel>
                      <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(value) => resourceTypeOptions.find((opt) => String(opt.value) === value)?.label}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {resourceTypeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showPatternAndName && (
                  <FormField
                    control={form.control}
                    name="patternType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pattern Type</FormLabel>
                        <div className="inline-flex h-10 w-full items-center justify-center rounded-md bg-muted p-1">
                          {[
                            { value: ACL_ResourcePatternType.LITERAL, label: 'Literal' },
                            { value: ACL_ResourcePatternType.PREFIXED, label: 'Prefixed' },
                            { value: ACL_ResourcePatternType.ANY, label: 'Any' },
                          ].map((opt) => (
                            <button
                              className={`inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 font-medium text-sm ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                                field.value === opt.value
                                  ? 'bg-background text-foreground shadow-sm'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                              key={opt.value}
                              onClick={() => field.onChange(opt.value)}
                              type="button"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {PATTERN_TYPE_HELP[field.value] && (
                          <Text className="mt-1 text-muted-foreground text-sm">{PATTERN_TYPE_HELP[field.value]}</Text>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {showResourceName && (
                  <FormField
                    control={form.control}
                    name="resourceName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resource Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. my-topic" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="operation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Operation</FormLabel>
                      <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(value) => OPERATION_OPTIONS.find((opt) => String(opt.value) === value)?.label}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {OPERATION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="permissionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Permission</FormLabel>
                      <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(value) => {
                                if (value === String(ACL_PermissionType.ALLOW)) {
                                  return <span className="text-green-600">Allow</span>;
                                }
                                if (value === String(ACL_PermissionType.DENY)) {
                                  return <span className="text-red-600">Deny</span>;
                                }
                                return null;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={String(ACL_PermissionType.ALLOW)}>
                            <span className="text-green-600">Allow</span>
                          </SelectItem>
                          <SelectItem value={String(ACL_PermissionType.DENY)}>
                            <span className="text-red-600">Deny</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="host"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Host</FormLabel>
                      <FormDescription>
                        Use <InlineCode>*</InlineCode> for all hosts, or an exact IP address. CIDR ranges are not
                        supported by the Kafka API.
                      </FormDescription>
                      <FormControl>
                        <Input placeholder="*" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {submitError && (
                  <Alert variant="destructive">
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}
              </div>
            </form>
          </Form>
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button onClick={handleClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button data-testid="add-acl-submit-button" disabled={isPending} form="add-acl-form" type="submit">
            Add ACL
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
