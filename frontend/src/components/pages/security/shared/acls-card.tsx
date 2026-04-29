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

const GRANT_ALL_RESOURCES: { type: ACL_ResourceType; label: string; name: string }[] = [
  { type: ACL_ResourceType.TOPIC, label: 'Topic', name: '*' },
  { type: ACL_ResourceType.GROUP, label: 'Consumer Group', name: '*' },
  { type: ACL_ResourceType.CLUSTER, label: 'Cluster', name: 'kafka-cluster' },
  { type: ACL_ResourceType.TRANSACTIONAL_ID, label: 'Transactional ID', name: '*' },
  { type: ACL_ResourceType.SUBJECT, label: 'Subject', name: '*' },
  { type: ACL_ResourceType.REGISTRY, label: 'Schema Registry', name: '*' },
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
  const list = acls ?? [];

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
    await Promise.all(
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
    setSelected(new Set());
  };

  const confirmGrantAllPermissions = async () => {
    if (!principal) return;
    await Promise.all(
      GRANT_ALL_RESOURCES.map((r) =>
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
                <Button asChild variant="link">
                  <a
                    href="https://docs.redpanda.com/current/manage/security/authorization/acls/"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Read the docs →
                  </a>
                </Button>
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
        <TableCell className="text-muted-foreground">{row.resourceType}</TableCell>
        <TableCell className="font-mono">{row.resourceName}</TableCell>
        <TableCell>{row.operation}</TableCell>
        <TableCell className={row.permissionType === 'Allow' ? 'text-green-600' : 'text-red-600'}>
          {row.permissionType}
        </TableCell>
        <TableCell className="text-muted-foreground">{row.host}</TableCell>
      </TableRow>
    ));
  };

  return (
    <>
      <ListLayout className="min-h-0 gap-3 py-0">
        <ListLayoutFilters
          actions={
            <div className="flex items-center gap-2">
              {someSelected && (
                <Button disabled={isDeleting} onClick={deleteSelected} size="sm" variant="destructive">
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
                <TableHead>Type</TableHead>
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
        <DialogContent size="md">
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
              {GRANT_ALL_RESOURCES.map((r) => (
                <TableRow key={r.type}>
                  <TableCell className="text-muted-foreground">{r.label}</TableCell>
                  <TableCell className="font-mono">{r.name}</TableCell>
                  <TableCell>All</TableCell>
                  <TableCell className="text-green-600">Allow</TableCell>
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
