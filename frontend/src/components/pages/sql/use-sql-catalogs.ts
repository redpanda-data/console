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

import { CatalogType } from 'protogen/redpanda/api/dataplane/v1alpha3/sql_pb';
import { useMemo } from 'react';
import { useGetSqlIdentityQuery, useListCatalogsQuery, useListTablesQuery } from 'react-query/api/sql';

import type { Catalog, SqlRole, TableRef } from './sql-types';

export type SqlCatalogs = {
  isLoading: boolean;
  /** Caller's effective role; admin unlocks write/DDL affordances. */
  sqlRole: SqlRole;
  /** Bare catalog list mapped to the tree view model (empty `tables`). */
  catalogs: Catalog[];
  /** Catalogs enriched with the Redpanda-catalog tables, for autocomplete and the overview. */
  completionCatalogs: Catalog[];
  hasTables: boolean;
  /** Raw ListTables response for the Redpanda catalog (drives the wizard's taken-topics set). */
  redpandaTablesData: ReturnType<typeof useListTablesQuery>['data'];
};

// Shared SQL catalog + identity fetching for the landing and the editor studio.
// Only one of those is mounted at a time (the route renders one or the other),
// so there is no double-fetch; React Query also dedupes if there were.
//
// `sqlRoleProp` lets tests/storybook pin the role; otherwise it's derived from
// the SQL identity (admin when the caller is a superuser).
export function useSqlCatalogs(sqlRoleProp?: SqlRole): SqlCatalogs {
  const { data: catalogsData, isLoading } = useListCatalogsQuery();
  const { data: identity } = useGetSqlIdentityQuery();
  const sqlRole: SqlRole = sqlRoleProp ?? (identity?.isAdmin ? 'admin' : 'viewer');

  const catalogs = useMemo<Catalog[]>(() => {
    // MVP surfaces only the Redpanda catalog; Iceberg catalog support lands later.
    const list = (catalogsData?.catalogs ?? []).filter((c) => c.type === CatalogType.REDPANDA);
    return list.map((c) => ({
      name: c.name,
      displayLabel: c.type === CatalogType.REDPANDA ? 'Redpanda Catalog' : c.name,
      engine: c.type === CatalogType.REDPANDA ? 'redpanda' : 'iceberg',
      namespaces: c.namespace ? [{ id: `${c.name}.${c.namespace}`, name: c.namespace, tables: [] }] : [],
    }));
  }, [catalogsData]);

  const redpandaCatalogName = useMemo(() => catalogs.find((c) => c.engine === 'redpanda')?.name ?? '', [catalogs]);
  const { data: redpandaTablesData } = useListTablesQuery({ catalog: redpandaCatalogName });
  const hasTables = (redpandaTablesData?.tables?.length ?? 0) > 0;

  const completionCatalogs = useMemo<Catalog[]>(
    () =>
      catalogs.map((catalog) => {
        if (catalog.name !== redpandaCatalogName) {
          return catalog;
        }
        const tablesByNamespace = new Map<string, TableRef[]>();
        for (const t of redpandaTablesData?.tables ?? []) {
          const list = tablesByNamespace.get(t.catalogNamespace) ?? [];
          list.push({
            id: `${catalog.name}.${t.catalogNamespace}.${t.name}`,
            name: t.name,
            namespaceName: t.catalogNamespace,
            catalogName: catalog.name,
            topicName: t.topic,
          });
          tablesByNamespace.set(t.catalogNamespace, list);
        }
        const namespaces = catalog.namespaces.map((ns) => ({
          ...ns,
          tables: tablesByNamespace.get(ns.name) ?? ns.tables,
        }));
        for (const [name, tables] of tablesByNamespace) {
          if (!namespaces.some((ns) => ns.name === name)) {
            namespaces.push({ id: `${catalog.name}.${name}`, name, tables });
          }
        }
        return { ...catalog, namespaces };
      }),
    [catalogs, redpandaCatalogName, redpandaTablesData]
  );

  return { isLoading, sqlRole, catalogs, completionCatalogs, hasTables, redpandaTablesData };
}
