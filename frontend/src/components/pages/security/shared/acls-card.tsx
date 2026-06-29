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
import { Heading } from 'components/redpanda-ui/components/typography';
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

import {
  type AclDetail,
  getGRPCOperationType,
  getGRPCPermissionType,
  getGRPCResourcePatternType,
  getGRPCResourceType,
  getResourceNameValue,
  OperationTypeNotSet,
} from './acl-model';
import { useCreateACLMutation, useDeleteAclMutation } from '../../../../react-query/api/acl';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { formatToastErrorMessageGRPC } from '../../../../utils/toast.utils';
import { Badge } from '../../../redpanda-ui/components/badge';
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

export const AclsCard = ({ acls, principal, isLoading }: AclsCardProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [grantAllOpen, setGrantAllOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { mutateAsync: deleteAcl, isPending: isDeleting } = useDeleteAclMutation();
  const { mutateAsync: createACL, isPending: isGranting } = useCreateACLMutation();
  const schemaRegistryACLApi = useSupportedFeaturesStore((s) => s.schemaRegistryACLApi);
  const list = acls ?? [];

  const grantAllResources = GRANT_ALL_RESOURCES.filter((r) => !r.requiresSchemaRegistry || schemaRegistryACLApi);

  let rowCounter = 0;
  const rows: AclRow[] = list.flatMap((detail) =>
    detail.rules.flatMap((rule) =>
      Object.entries(rule.operations)
        .filter(([, perm]) => perm !== OperationTypeNotSet)
        .map(([op, perm]) => ({
          id: String(rowCounter++),
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
  );

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (someSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const deleteSelected = async () => {
    const results = await Promise.allSettled(
      rows
        .filter((r) => selected.has(r.id))
        .map((r) =>
          deleteAcl(
            create(DeleteACLsRequestSchema, {
              filter: {
                principal: r.rawPrincipal,
                resourceType: r.rawResourceType,
                resourceName: r.resourceName,
                host: r.host,
                operation: r.rawOperation,
                permissionType: r.rawPermissionType,
                resourcePatternType: r.rawPatternType,
              },
            })
          )
        )
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        toast.error(formatToastErrorMessageGRPC({ error: result.reason, action: 'delete', entity: 'ACL' }));
      }
    }
    setSelected(new Set());
  };

  const confirmGrantAllPermissions = async () => {
    if (!principal) return;
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
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    const succeeded = results.length - failed.length;
    if (failed.length > 0 && succeeded > 0) {
      for (const f of failed) {
        toast.warning('Some ACLs were created, but there were errors', {
          description: formatToastErrorMessageGRPC({ error: f.reason, action: 'create', entity: 'ACL' }),
        });
      }
    } else if (failed.length > 0) {
      for (const f of failed) {
        toast.error(formatToastErrorMessageGRPC({ error: f.reason, action: 'create', entity: 'ACL' }));
      }
    } else {
      toast.success('ACLs created');
    }
    setGrantAllOpen(false);
  };

  const renderBody = () => {
    if (isLoading) {
      return [0, 1, 2].map((i) => (
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
    }
    if (rows.length === 0) {
      return (
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
                    <a
                      href="https://docs.redpanda.com/current/manage/security/authorization/acl/"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
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
    }
    return rows.map((row) => (
      <TableRow key={row.id}>
        <TableCell>
          <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleRow(row.id)} />
        </TableCell>
        <TableCell>
          <Badge variant="simple">{row.resourceType}</Badge>
        </TableCell>
        <TableCell className="font-mono">{row.resourceName}</TableCell>
        <TableCell>{row.operation}</TableCell>
        <TableCell className={row.permissionType === 'Allow' ? 'text-success' : 'text-error'}>
          {row.permissionType}
        </TableCell>
        <TableCell className="text-muted-foreground">{row.host}</TableCell>
      </TableRow>
    ));
  };

  return (
    <>
      <ListLayout className="my-4 min-h-0 gap-3 py-0">
        <ListLayoutFilters
          actions={
            <div className="flex items-center gap-2">
              {someSelected && (
                <Button disabled={isDeleting} onClick={deleteSelected} variant="destructive">
                  Delete selected ({selected.size})
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
          <Heading as="h2" level={4}>
            ACLs
          </Heading>
        </ListLayoutFilters>
        <ListLayoutContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Resource Type</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Permission</TableHead>
                <TableHead>Host</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{renderBody()}</TableBody>
          </Table>
        </ListLayoutContent>
      </ListLayout>

      {principal && <AddAclDialog onOpenChange={setDialogOpen} open={dialogOpen} principal={principal} />}

      <Dialog onOpenChange={setGrantAllOpen} open={grantAllOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Allow all operations</DialogTitle>
            <DialogDescription>
              The following ACLs will be created for <span className="font-medium font-mono">{principal}</span>:
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
                  <TableCell className="text-muted-foreground">{r.label}</TableCell>
                  <TableCell className="font-mono">{r.name}</TableCell>
                  <TableCell>All</TableCell>
                  <TableCell className="text-success">Allow</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <DialogFooter>
            <Button onClick={() => setGrantAllOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isGranting} onClick={confirmGrantAllPermissions} type="button">
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
