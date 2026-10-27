import { ShieldIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '../../../redpanda-ui/components/badge';
import { TableCell, TableRow } from '../../../redpanda-ui/components/table';
import type { FlatAclEntry } from '../hooks/use-principal-permissions';

export const PermissionTypeText = ({ permissionType }: { permissionType: string }) => (
  <span className={permissionType === 'Allow' ? 'text-success' : 'text-destructive'}>{permissionType}</span>
);

type AclPermissionRowProps = FlatAclEntry & {
  /** Leading cells, such as a selection checkbox. */
  leading?: ReactNode;
  /** Trailing cells, such as row actions. */
  children?: ReactNode;
};

export const AclPermissionRow = ({
  resourceType,
  resourceName,
  operation,
  permissionType,
  host,
  leading,
  children,
}: AclPermissionRowProps) => (
  <TableRow>
    {leading}
    <TableCell>
      <Badge tone="default" variant="outline">
        {resourceType}
      </Badge>
    </TableCell>
    <TableCell>
      <span className="font-mono">{resourceName}</span>
    </TableCell>
    <TableCell>{operation}</TableCell>
    <TableCell>
      <PermissionTypeText permissionType={permissionType} />
    </TableCell>
    <TableCell>
      <span className="text-muted-foreground">{host}</span>
    </TableCell>
    {children}
  </TableRow>
);

/** Section row that introduces the ACLs a principal inherits from one role. */
export const RoleAclGroupRow = ({ roleName, colSpan }: { roleName: string; colSpan: number }) => (
  <TableRow>
    <TableCell colSpan={colSpan}>
      <div className="flex items-center gap-1.5">
        <ShieldIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium tracking-wide uppercase">Via Role: {roleName}</span>
      </div>
    </TableCell>
  </TableRow>
);
