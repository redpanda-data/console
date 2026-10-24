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
import { KeyRoundIcon } from 'lucide-react';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  CreateACLRequestSchema,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { useState } from 'react';
import { toast } from 'sonner';
import { docsLinks } from 'utils/docs-links';

import {
  type AclDetail,
  getGRPCOperationType,
  getGRPCPermissionType,
  getGRPCResourcePatternType,
  getGRPCResourceType,
  getResourceNameValue,
  OperationTypeNotSet,
} from './acl-model';
import { AclPermissionRow, PermissionTypeText } from './acl-permission-rows';
import { useCreateACLMutation, useDeleteAclMutation } from '../../../../react-query/api/acl';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { formatToastErrorMessageGRPC } from '../../../../utils/toast.utils';
import { Button } from '../../../redpanda-ui/components/button';
import { Checkbox } from '../../../redpanda-ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../redpanda-ui/components/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../../../redpanda-ui/components/empty';
import { ListLayout, ListLayoutContent, ListLayoutFilters } from '../../../redpanda-ui/components/list-layout';
import { Skeleton } from '../../../redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import { useRowSelection } from '../hooks/use-row-selection';
import { AddAclDialog } from '../users/add-acl-dialog';

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  cluster: 'Cluster',
  topic: 'Topic',
  consumerGroup: 'Consumer Group',
  transactionalId: 'Transactional ID',
  subject: 'Subject',
  schemaRegistry: 'Schema Registry',
};

const GRANT_ALL_RESOURCES: { type: ACL_ResourceType; label: string; name: string; requiresSchemaRegistry: boolean }[] =
  [
    { type: ACL_ResourceType.TOPIC, label: 'Topic', name: '*', requiresSchemaRegistry: false },
    { type: ACL_ResourceType.GROUP, label: 'Consumer Group', name: '*', requiresSchemaRegistry: false },
    { type: ACL_ResourceType.CLUSTER, label: 'Cluster', name: 'kafka-cluster', requiresSchemaRegistry: false },
    { type: ACL_ResourceType.TRANSACTIONAL_ID, label: 'Transactional ID', name: '*', requiresSchemaRegistry: false },
    { type: ACL_ResourceType.SUBJECT, label: 'Subject', name: '*', requiresSchemaRegistry: true },
    { type: ACL_ResourceType.REGISTRY, label: 'Schema Registry', name: '*', requiresSchemaRegistry: true },
  ];

type AclRow = {
  id: string;
  resourceType: string;
  resourceName: string;
  operation: string;
  permissionType: 'Allow' | 'Deny';
  host: string;
  rawResourceType: ACL_ResourceType;
  rawPatternType: ACL_ResourcePatternType;
  rawOperation: ACL_Operation;
  rawPermissionType: ACL_PermissionType;
  rawPrincipal: string;
};

type AclsCardProps = {
  acls?: AclDetail[];
  principal?: string;
  isLoading?: boolean;
};

const toAclRows = (list: AclDetail[]): AclRow[] =>
  list
    .flatMap((detail) =>
      detail.rules.flatMap((rule) =>
        Object.entries(rule.operations)
          .filter(([, perm]) => perm !== OperationTypeNotSet)
          .map(([op, perm]) => ({
            resourceType: RESOURCE_TYPE_LABELS[rule.resourceType] ?? rule.resourceType,
            resourceName: getResourceNameValue(rule),
            operation: op.charAt(0) + op.slice(1).toLowerCase(),
            permissionType: (perm === 'allow' ? 'Allow' : 'Deny') as 'Allow' | 'Deny',
            host: detail.sharedConfig.host,
            rawResourceType: getGRPCResourceType(rule.resourceType),
            rawPatternType:
              rule.selectorType === 'any'
                ? ACL_ResourcePatternType.LITERAL
                : getGRPCResourcePatternType(rule.selectorType),
            rawOperation: getGRPCOperationType(op),
            rawPermissionType: getGRPCPermissionType(perm),
            rawPrincipal: detail.sharedConfig.principal,
          }))
      )
    )
    .map((row, index) => ({ ...row, id: String(index) }));

const deleteRequestFor = (row: AclRow) =>
  create(DeleteACLsRequestSchema, {
    filter: {
      principal: row.rawPrincipal,
      resourceType: row.rawResourceType,
      resourceName: row.resourceName,
      host: row.host,
      operation: row.rawOperation,
      permissionType: row.rawPermissionType,
      resourcePatternType: row.rawPatternType,
    },
  });

const toastGrantAllResults = (results: PromiseSettledResult<unknown>[]) => {
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed.length === 0) {
    toast.success('ACLs created');
    return;
  }
  const someCreated = failed.length < results.length;
  for (const f of failed) {
    const description = formatToastErrorMessageGRPC({ error: f.reason, action: 'create', entity: 'ACL' });
    if (someCreated) {
      toast.warning('Some ACLs were created, but there were errors', { description });
    } else {
      toast.error(description);
    }
  }
};

type GrantAllPermissionsDialogProps = {
  principal: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const GrantAllPermissionsDialog = ({ principal, open, onOpenChange }: GrantAllPermissionsDialogProps) => {
  const { mutateAsync: createACL, isPending: isGranting } = useCreateACLMutation();
  const schemaRegistryACLApi = useSupportedFeaturesStore((s) => s.schemaRegistryACLApi);
  const grantAllResources = GRANT_ALL_RESOURCES.filter((r) => !r.requiresSchemaRegistry || schemaRegistryACLApi);

  const confirmGrantAllPermissions = async () => {
    if (!principal) {
      return;
    }
    const results = await Promise.allSettled(
      grantAllResources.map((r) =>
        createACL(
          create(CreateACLRequestSchema, {
            resourceType: r.type,
            resourceName: r.name,
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            principal,
            host: '*',
            operation: ACL_Operation.ALL,
            permissionType: ACL_PermissionType.ALLOW,
          })
        )
      )
    );
    toastGrantAllResults(results);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Allow all operations</DialogTitle>
          <DialogDescription>
            The following ACLs will be created for <span className="font-mono font-medium">{principal}</span>:
          </DialogDescription>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource Type</TableHead>
              <TableHead>Resource Name</TableHead>
              <TableHead>Operation</TableHead>
              <TableHead>Permission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grantAllResources.map((r) => (
              <TableRow key={r.type}>
                <TableCell>
                  <span className="text-muted-foreground">{r.label}</span>
                </TableCell>
                <TableCell>
                  <span className="font-mono">{r.name}</span>
                </TableCell>
                <TableCell>All</TableCell>
                <TableCell>
                  <PermissionTypeText permissionType="Allow" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={isGranting} onClick={confirmGrantAllPermissions} type="button">
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AclRowsSkeleton = () =>
  [0, 1, 2].map((i) => (
    <TableRow key={i}>
      <TableCell />
      <TableCell>
        <Skeleton variant="text" width="sm" />
      </TableCell>
      <TableCell>
        <Skeleton variant="text" width="md" />
      </TableCell>
      <TableCell>
        <Skeleton variant="text" width="sm" />
      </TableCell>
      <TableCell>
        <Skeleton variant="text" width="sm" />
      </TableCell>
      <TableCell>
        <Skeleton variant="text" width="xs" />
      </TableCell>
    </TableRow>
  ));

const NoAclsRow = () => (
  <TableRow>
    <TableCell colSpan={6}>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRoundIcon />
          </EmptyMedia>
          <EmptyTitle>No ACLs assigned</EmptyTitle>
          <EmptyDescription>
            Add ACLs to define what operations this role can perform on cluster resources.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            render={
              <a href={docsLinks.selfManaged.acl} rel="noopener noreferrer" target="_blank">
                Read the docs →
              </a>
            }
            variant="link"
          />
        </EmptyContent>
      </Empty>
    </TableCell>
  </TableRow>
);

type AclRowsProps = {
  isLoading?: boolean;
  rows: AclRow[];
  isSelected: (id: string) => boolean;
  onToggle: (id: string) => void;
};

const AclRows = ({ isLoading, rows, isSelected, onToggle }: AclRowsProps) => {
  if (isLoading) {
    return <AclRowsSkeleton />;
  }
  if (rows.length === 0) {
    return <NoAclsRow />;
  }
  return rows.map((row) => (
    <AclPermissionRow
      key={row.id}
      {...row}
      leading={
        <TableCell>
          <Checkbox checked={isSelected(row.id)} onCheckedChange={() => onToggle(row.id)} />
        </TableCell>
      }
    />
  ));
};

export const AclsCard = ({ acls, principal, isLoading }: AclsCardProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [grantAllOpen, setGrantAllOpen] = useState(false);
  const { mutateAsync: deleteAcl, isPending: isDeleting } = useDeleteAclMutation();
  const rows = toAclRows(acls ?? []);
  const selection = useRowSelection(rows.map((r) => r.id));

  const deleteSelected = async () => {
    const results = await Promise.allSettled(
      rows.filter((r) => selection.selected.has(r.id)).map((r) => deleteAcl(deleteRequestFor(r)))
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        toast.error(formatToastErrorMessageGRPC({ error: result.reason, action: 'delete', entity: 'ACL' }));
      }
    }
    selection.clear();
  };

  return (
    <>
      <ListLayout className="my-4 min-h-0">
        <ListLayoutFilters
          actions={
            <div className="flex items-center gap-2">
              {selection.someSelected && (
                <Button disabled={isDeleting} onClick={deleteSelected} variant="destructive">
                  Delete selected ({selection.selected.size})
                </Button>
              )}
              {principal && (
                <Button onClick={() => setGrantAllOpen(true)} variant="outline">
                  Allow all operations
                </Button>
              )}
              <Button onClick={() => setDialogOpen(true)} testId="add-acl-button" variant="outline">
                + Add ACL
              </Button>
            </div>
          }
        >
          <h2 className="text-heading-sm">ACLs</h2>
        </ListLayoutFilters>
        <ListLayoutContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Checkbox
                    checked={selection.allSelected ? true : selection.someSelected ? 'indeterminate' : false}
                    onCheckedChange={selection.toggleAll}
                  />
                </TableHead>
                <TableHead>Resource Type</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Permission</TableHead>
                <TableHead>Host</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AclRows
                isLoading={isLoading}
                isSelected={(id) => selection.selected.has(id)}
                onToggle={selection.toggleRow}
                rows={rows}
              />
            </TableBody>
          </Table>
        </ListLayoutContent>
      </ListLayout>

      {principal && <AddAclDialog onOpenChange={setDialogOpen} open={dialogOpen} principal={principal} />}

      <GrantAllPermissionsDialog onOpenChange={setGrantAllOpen} open={grantAllOpen} principal={principal} />
    </>
  );
};
