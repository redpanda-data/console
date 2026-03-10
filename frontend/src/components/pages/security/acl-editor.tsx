/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Combobox, type ComboboxOption } from 'components/redpanda-ui/components/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Text } from 'components/redpanda-ui/components/typography';
import { Info, Plus, Shield, Trash2 } from 'lucide-react';
import { ACL_ResourcePatternType } from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { useEffect, useState } from 'react';

// ─── Shared helpers ─────────────────────────────────────────────────────────

export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}\u2026`;
}

export const RESOURCE_NAME_MAX = 64;
export const PRINCIPAL_MAX = 60;

export function getPatternTypeLabel(type?: number): string | null {
  if (type === ACL_ResourcePatternType.PREFIXED) {
    return 'Prefixed';
  }
  return null;
}

// ─── Shared ACL types & constants ────────────────────────────────────────────

export interface ACLEntry {
  resourceType: string;
  resourceName: string;
  operation: string;
  permission: string;
  host: string;
  resourcePatternType?: number;
}

const resourceTypes: readonly string[] = ['Topic', 'Group', 'Cluster', 'TransactionalId'];

const operationsByResourceType: Record<string, string[]> = {
  Topic: ['All', 'Read', 'Write', 'Describe', 'Create', 'Delete', 'Alter', 'DescribeConfigs', 'AlterConfigs'],
  Group: ['All', 'Read', 'Describe', 'Delete'],
  Cluster: [
    'All',
    'Create',
    'Describe',
    'Alter',
    'ClusterAction',
    'DescribeConfigs',
    'AlterConfigs',
    'IdempotentWrite',
  ],
  TransactionalId: ['All', 'Describe', 'Write'],
};

const permissions: readonly string[] = ['Allow', 'Deny'];

type PatternType = 'Literal' | 'Prefixed' | 'Any';

function validateHost(host: string): string | null {
  const trimmed = host.trim();
  if (!trimmed) {
    return 'Host is required';
  }
  if (trimmed === '*') {
    return null;
  }
  if (trimmed.includes('/')) {
    return 'CIDR notation is not supported. The Kafka ACL API only accepts a single IP address or * for all hosts.';
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  if (ipv4.test(trimmed)) {
    const parts = trimmed.split('.').map(Number);
    if (parts.every((p) => p >= 0 && p <= 255)) {
      return null;
    }
    return 'Invalid IPv4 address';
  }
  if (ipv6.test(trimmed) && trimmed.includes(':')) {
    return null;
  }
  return 'Host must be * (all hosts) or a valid IP address. CIDR notation is not supported.';
}

// ─── ACL Dialog (create) ─────────────────────────────────────────────────────

interface ACLDialogProps {
  open: boolean;
  context?: 'role' | 'user';
  onSave: (acl: ACLEntry) => void;
  onClose: () => void;
  resourceOptionsByType?: Partial<Record<'Cluster' | 'Group' | 'Topic' | 'TransactionalId', ComboboxOption[]>>;
}

export function ACLDialog({ open, context = 'role', onSave, onClose, resourceOptionsByType = {} }: ACLDialogProps) {
  const [resourceType, setResourceType] = useState('Topic');
  const [resourceName, setResourceName] = useState('');
  const [operation, setOperation] = useState('All');
  const [permission, setPermission] = useState('Allow');
  const [host, setHost] = useState('*');
  const [patternType, setPatternType] = useState<PatternType>('Literal');
  const [error, setError] = useState<string | null>(null);

  const resourceOptions = resourceOptionsByType[resourceType as keyof typeof resourceOptionsByType] ?? [];

  useEffect(() => {
    if (!open) {
      return;
    }
    setResourceType('Topic');
    setResourceName('');
    setOperation('All');
    setPermission('Allow');
    setHost('*');
    setPatternType('Literal');
    setError(null);
  }, [open]);

  const handleSave = () => {
    let resolvedResourceName = '';
    if (resourceType === 'Cluster') {
      resolvedResourceName = 'kafka-cluster';
    } else if (patternType === 'Any') {
      resolvedResourceName = '*';
    } else {
      if (!resourceName.trim()) {
        setError('Resource name is required');
        return;
      }
      resolvedResourceName = resourceName.trim();
    }
    const hostError = validateHost(host);
    if (hostError) {
      setError(hostError);
      return;
    }
    const patternTypeMap: Record<PatternType, ACL_ResourcePatternType> = {
      Literal: ACL_ResourcePatternType.LITERAL,
      Prefixed: ACL_ResourcePatternType.PREFIXED,
      Any: ACL_ResourcePatternType.LITERAL,
    };

    onSave({
      resourceType,
      resourceName: resolvedResourceName,
      operation,
      permission,
      host: host.trim(),
      resourcePatternType: patternTypeMap[patternType],
    });
  };

  const entityLabel = context === 'user' ? 'user' : 'role';

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader spacing="loose">
          <DialogTitle>Add ACL</DialogTitle>
          <DialogDescription>Define a new access control rule for this {entityLabel}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resource Type */}
          <div className="space-y-1">
            <Label>Resource Type</Label>
            <Select
              onValueChange={(v) => {
                setResourceType(v);
                setResourceName('');
                const ops = operationsByResourceType[v] || [];
                if (!ops.includes(operation)) {
                  setOperation(ops[0] || 'All');
                }
                if (v === 'Cluster') {
                  setResourceName('');
                  setPatternType('Literal');
                }
                setError(null);
              }}
              value={resourceType}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resourceTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pattern Type — hidden for Cluster */}
          {resourceType !== 'Cluster' && (
            <div className="space-y-1">
              <Label>Pattern Type</Label>
              <div className="flex gap-1 rounded-lg border p-1">
                {(['Literal', 'Prefixed', 'Any'] as const).map((pt) => (
                  <button
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      patternType === pt
                        ? 'bg-foreground text-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    key={pt}
                    onClick={() => {
                      setPatternType(pt);
                      if (pt === 'Any') {
                        setResourceName('');
                      }
                      setError(null);
                    }}
                    type="button"
                  >
                    {pt}
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-sm">
                {patternType === 'Literal' && 'Matches the exact resource name.'}
                {patternType === 'Prefixed' && 'Matches any resource whose name starts with this prefix.'}
                {patternType === 'Any' && 'Matches all resources of this type (wildcard).'}
              </p>
            </div>
          )}

          {resourceType === 'Cluster' && (
            <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
              <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                Cluster ACLs apply to the entire Kafka cluster. No resource name is needed.
              </p>
            </div>
          )}

          {/* Resource Name — hidden for Cluster and "Any" pattern */}
          {resourceType !== 'Cluster' && patternType !== 'Any' && (
            <div className="space-y-1">
              <Label htmlFor="acl-resource-name">
                {patternType === 'Prefixed' ? 'Resource Name Prefix' : 'Resource Name'}
              </Label>
              <Combobox
                autocomplete
                className="font-mono"
                creatable
                onChange={(value) => {
                  setResourceName(value);
                  setError(null);
                }}
                options={resourceOptions}
                placeholder={patternType === 'Prefixed' ? 'e.g. com.company.events' : 'e.g. my-topic'}
                value={resourceName}
              />
            </div>
          )}

          {/* Operation */}
          <div className="space-y-1">
            <Label>Operation</Label>
            <Select onValueChange={setOperation} value={operation}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(operationsByResourceType[resourceType] || []).map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Permission */}
          <div className="space-y-1">
            <Label>Permission</Label>
            <Select onValueChange={setPermission} value={permission}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {permissions.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className={p === 'Allow' ? 'text-emerald-600' : 'text-destructive'}>{p}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Host */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="acl-host">Host</Label>
              <p className="text-muted-foreground text-sm">
                Use <code className="rounded bg-muted px-1 font-mono">*</code> for all hosts, or an exact IP address.
                CIDR ranges are not supported by the Kafka API.
              </p>
            </div>
            <Input
              className="font-mono"
              id="acl-host"
              onChange={(e) => {
                setHost(e.target.value);
                setError(null);
              }}
              placeholder="*"
              type="text"
              value={host}
            />
          </div>

          {Boolean(error) && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSave}>Add ACL</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ACL Remove Confirmation Dialog ──────────────────────────────────────────

interface ACLRemoveDialogProps {
  open: boolean;
  acl: ACLEntry | null;
  context?: 'role' | 'user';
  onConfirm: () => void;
  onClose: () => void;
}

export function ACLRemoveDialog({ open, acl, context = 'role', onConfirm, onClose }: ACLRemoveDialogProps) {
  return (
    <AlertDialog onOpenChange={(o) => !o && onClose()} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove ACL?</AlertDialogTitle>
          <AlertDialogDescription>
            {context === 'user'
              ? 'Remove this access control rule from the user?'
              : 'Remove this access control rule from the role? Principals assigned to this role will lose this permission.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {acl && (
          <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
            <div className="flex items-center gap-1.5">
              <Badge className="font-normal text-sm" variant="outline">
                {acl.resourceType}
              </Badge>
              <span className="font-mono">{acl.resourceName}</span>
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              {acl.operation} / {acl.permission} / Host: {acl.host}
            </p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild onClick={onConfirm}>
            <Button variant="destructive">Remove</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── ACL Table with actions ──────────────────────────────────────────────────

interface ACLTableSectionProps {
  acls: ACLEntry[];
  context?: 'role' | 'user';
  onAdd: () => void;
  onRemove: (index: number) => void;
}

export function ACLTableSection({ acls, context = 'role', onAdd, onRemove }: ACLTableSectionProps) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />
          <Text as="span" className="font-semibold text-base">
            ACLs
          </Text>
          <Text as="span" variant="muted">
            {acls.length} {acls.length === 1 ? 'rule' : 'rules'}
          </Text>
        </div>
        <Button onClick={onAdd}>
          <Plus className="size-4" />
          Add ACL
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        {acls.length > 0 ? (
          <Table className="table-fixed" size="lg">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[14%]">Resource Type</TableHead>
                <TableHead className="w-auto">Resource Name</TableHead>
                <TableHead className="w-[12%]">Operation</TableHead>
                <TableHead className="w-[10%]">Permission</TableHead>
                <TableHead className="w-[10%]">Host</TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acls.map((acl, idx) => (
                <TableRow key={`${acl.resourceType}-${acl.resourceName}-${acl.operation}-${idx}`}>
                  <TableCell className="py-1.5">
                    <Badge className="font-normal text-sm" variant="outline">
                      {acl.resourceType}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-0 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-base" title={acl.resourceName}>
                        {truncateText(acl.resourceName, RESOURCE_NAME_MAX)}
                      </span>
                      {Boolean(getPatternTypeLabel(acl.resourcePatternType)) && (
                        <Badge className="shrink-0 font-normal text-xs" variant="secondary">
                          {getPatternTypeLabel(acl.resourcePatternType)}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 text-base">{acl.operation}</TableCell>
                  <TableCell className="py-1.5">
                    <span
                      className={`font-medium text-base ${acl.permission === 'Allow' ? 'text-emerald-600' : 'text-destructive'}`}
                    >
                      {acl.permission}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 font-mono text-base">{acl.host}</TableCell>
                  <TableCell className="py-1.5">
                    <Button
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(idx)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Remove ACL</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="py-12">
            <EmptyMedia variant="icon">
              <Shield className="size-6" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No ACLs defined</EmptyTitle>
              <EmptyDescription>
                {context === 'user'
                  ? 'This user has no direct ACLs. Permissions may be inherited through assigned roles.'
                  : 'Add ACLs to define what this role can access.'}
              </EmptyDescription>
            </EmptyHeader>
            <Button onClick={onAdd}>
              <Plus className="size-4" />
              Add ACL
            </Button>
          </Empty>
        )}
      </div>
    </div>
  );
}

// ─── Principal step dialog (used by permissions tab) ─────────────────────────

interface PrincipalStepDialogProps {
  options: ComboboxOption[];
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  onClose: () => void;
}

export function PrincipalStepDialog({ options, value, onChange, onContinue, onClose }: PrincipalStepDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Principal is required');
      return;
    }
    if (!trimmed.includes(':')) {
      setError('Principal must include a type prefix (e.g. User:name)');
      return;
    }
    onContinue();
  };

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open>
      <DialogContent className="sm:max-w-md">
        <DialogHeader spacing="loose">
          <DialogTitle>Create ACL</DialogTitle>
          <DialogDescription>
            Enter the principal this ACL will apply to, then define the access rule.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="principal-input">Principal</Label>
              <p className="text-muted-foreground text-sm">
                Type a principal in the format <code className="rounded bg-muted px-1 font-mono">Type:name</code>.
                Supported types: User, Group, RedpandaRole.
              </p>
            </div>
            <Combobox
              autocomplete
              className="font-mono"
              creatable
              onChange={(nextValue) => {
                onChange(nextValue);
                setError(null);
              }}
              options={options}
              placeholder="e.g. User:ben or Group:my-team"
              value={value}
            />
            {Boolean(error) && <p className="text-destructive text-sm">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
