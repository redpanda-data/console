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
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  CreateACLRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useCreateACLMutation } from '../../../../react-query/api/acl';
import { useListUsersQuery } from '../../../../react-query/api/user';
import { Alert, AlertDescription } from '../../../redpanda-ui/components/alert';
import { Button } from '../../../redpanda-ui/components/button';
import { Combobox } from '../../../redpanda-ui/components/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../redpanda-ui/components/dialog';
import { Input } from '../../../redpanda-ui/components/input';
import { Label } from '../../../redpanda-ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../redpanda-ui/components/select';

const schema = z.object({
  resourceType: z.nativeEnum(ACL_ResourceType),
  patternType: z.nativeEnum(ACL_ResourcePatternType),
  resourceName: z.string(),
  operation: z.nativeEnum(ACL_Operation),
  permissionType: z.nativeEnum(ACL_PermissionType),
  host: z.string(),
});

type FormValues = z.infer<typeof schema>;

const RESOURCE_TYPE_OPTIONS = [
  { value: ACL_ResourceType.TOPIC, label: 'Topic' },
  { value: ACL_ResourceType.GROUP, label: 'Consumer Group' },
  { value: ACL_ResourceType.CLUSTER, label: 'Cluster' },
  { value: ACL_ResourceType.TRANSACTIONAL_ID, label: 'Transactional ID' },
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
  const userOptions = useMemo(
    () => (usersData?.users ?? []).map((u) => ({ value: u.name, label: u.name })),
    [usersData]
  );

  const effectivePrincipal = principal ?? `${principalType}:${principalValue}`;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      resourceType: ACL_ResourceType.TOPIC,
      patternType: ACL_ResourcePatternType.LITERAL,
      resourceName: '',
      operation: ACL_Operation.ALL,
      permissionType: ACL_PermissionType.ALLOW,
      host: '*',
    },
  });

  const resourceType = form.watch('resourceType');
  const patternType = form.watch('patternType');

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
    try {
      await createACL(
        create(CreateACLRequestSchema, {
          resourceType: values.resourceType,
          resourceName: values.resourceName || '*',
          resourcePatternType: values.patternType,
          principal: effectivePrincipal,
          host: values.host || '*',
          operation: values.operation,
          permissionType: values.permissionType,
        })
      );
      onOpenChange(false);
      form.reset();
      if (!principal) resetPrincipalSelector();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
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
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-4 py-2">
            {!principal && (
              <div className="space-y-2">
                <Label>Principal</Label>
                <div className="flex gap-2">
                  <Select
                    onValueChange={(v: 'User' | 'Group') => {
                      setPrincipalType(v);
                      setPrincipalValue('');
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
                      onChange={setPrincipalValue}
                      options={userOptions}
                      placeholder="Select a user..."
                      value={principalValue}
                    />
                  ) : (
                    <input
                      // biome-ignore lint/a11y/noAutofocus: auto-focus after switching type so the user can type immediately
                      autoFocus
                      className="flex h-8 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onChange={(e) => setPrincipalValue(e.target.value)}
                      placeholder="Enter group name..."
                      value={principalValue}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Resource Type</Label>
              <Controller
                control={form.control}
                name="resourceType"
                render={({ field }) => (
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOURCE_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {showPatternAndName && (
              <div className="space-y-2">
                <Label>Pattern Type</Label>
                <Controller
                  control={form.control}
                  name="patternType"
                  render={({ field }) => (
                    <div>
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
                        <p className="mt-1 text-muted-foreground text-sm">{PATTERN_TYPE_HELP[field.value]}</p>
                      )}
                    </div>
                  )}
                />
              </div>
            )}

            {showResourceName && (
              <div className="space-y-2">
                <Label>Resource Name</Label>
                <Input placeholder="e.g. my-topic" {...form.register('resourceName')} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Operation</Label>
              <Controller
                control={form.control}
                name="operation"
                render={({ field }) => (
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Permission</Label>
              <Controller
                control={form.control}
                name="permissionType"
                render={({ field }) => (
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={String(ACL_PermissionType.ALLOW)}>
                        <span className="text-green-600">Allow</span>
                      </SelectItem>
                      <SelectItem value={String(ACL_PermissionType.DENY)}>
                        <span className="text-red-600">Deny</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Host</Label>
              <p className="text-muted-foreground text-sm">
                Use <code>*</code> for all hosts, or an exact IP address. CIDR ranges are not supported by the Kafka
                API.
              </p>
              <Input placeholder="*" {...form.register('host')} />
            </div>

            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button onClick={handleClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isPending || !(principal || principalValue)} type="submit">
              Add ACL
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
