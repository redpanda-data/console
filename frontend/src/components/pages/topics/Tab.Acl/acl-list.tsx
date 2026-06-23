/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { useUrlTableState } from '../../../../hooks/use-url-table-state';
import type {
  AclRule,
  AclStrOperation,
  AclStrPermission,
  AclStrResourcePatternType,
  AclStrResourceType,
  GetAclOverviewResponse,
} from '../../../../state/rest-interfaces';
import { uiSettings } from '../../../../state/ui';
import { toJson } from '../../../../utils/json-utils';
import { Alert, AlertDescription } from '../../../redpanda-ui/components/alert';
import { DataTableColumnHeader, DataTablePagination } from '../../../redpanda-ui/components/data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';

type Acls = GetAclOverviewResponse | null | undefined;

type AclFlatResource = {
  eqKey: string;
  principal: string;
  host: string;
  operation: AclStrOperation;
  permissionType: AclStrPermission;
  resourceType: AclStrResourceType;
  resourceName: string;
  resourcePatternType: AclStrResourcePatternType;
  acls: AclRule[];
};

function flatResourceList(store: Acls): AclFlatResource[] {
  if (!store || store.aclResources === null) {
    return [];
  }
  return store.aclResources
    .flatMap((res) => res.acls.map((rule) => ({ ...res, ...rule })))
    .map((x) => ({ ...x, eqKey: toJson(x) }));
}

const columns: ColumnDef<AclFlatResource>[] = [
  {
    accessorKey: 'resourceType',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Resource" />,
  },
  {
    accessorKey: 'permissionType',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Permission" />,
  },
  {
    accessorKey: 'principal',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Principal" />,
  },
  {
    accessorKey: 'operation',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Operation" />,
  },
  {
    accessorKey: 'resourcePatternType',
    header: ({ column }) => <DataTableColumnHeader column={column} title="PatternType" />,
  },
  {
    accessorKey: 'resourceName',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'host',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Host" />,
  },
];

const AclList = ({ acl }: { acl: Acls }) => {
  const resources = flatResourceList(acl);

  const { sorting, pagination, onSortingChange, onPaginationChange } = useUrlTableState({
    keyPrefix: 'acl',
    settings: uiSettings.topicAclList,
    rowCount: resources.length,
  });

  const table = useReactTable({
    data: resources,
    columns,
    state: { sorting, pagination },
    onSortingChange,
    onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  return (
    <>
      {acl === null && (
        <Alert className="mb-4" variant="warning">
          <AlertDescription>You do not have the necessary permissions to view ACLs</AlertDescription>
        </Alert>
      )}
      {acl?.isAuthorizerEnabled === false && (
        <Alert className="mb-4" variant="warning">
          <AlertDescription>There&apos;s no authorizer configured in your Kafka cluster</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell className="text-center" colSpan={columns.length}>
                No data found
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <DataTablePagination table={table} />
    </>
  );
};

export default AclList;
