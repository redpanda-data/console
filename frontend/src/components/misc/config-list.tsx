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

import { EyeOffIcon, InfoIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTable, type DataTableColumnDef } from 'components/redpanda-ui/components/data-table';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { JSX } from 'react';

import styles from './ConfigList.module.scss';
import type { ConfigEntry } from '../../state/rest-interfaces';
import type { ValueDisplay } from '../../state/ui';
import { formatConfigValue } from '../../utils/formatters/config-value-formatter';
import { equalsIgnoreCase } from '../../utils/utils';

export function ConfigList({
  configEntries,
  valueDisplay,
  renderTooltip,
}: {
  configEntries: ConfigEntry[];
  valueDisplay: ValueDisplay;
  renderTooltip?: (e: ConfigEntry, content: JSX.Element) => JSX.Element;
}) {
  const allTypesUnknown = configEntries.all((x) => equalsIgnoreCase(x.type, 'unknown'));

  // Chakra's DataTable injected this column whenever `subComponent` was set; the Registry one does not.
  const expanderColumn: DataTableColumnDef<ConfigEntry> = {
    id: 'expander',
    size: 40,
    enableSorting: false,
    cell: ({ row }) =>
      row.getCanExpand() ? (
        <Button
          aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
          onClick={row.getToggleExpandedHandler()}
          size="icon-xs"
          variant="ghost"
        >
          {row.getIsExpanded() ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </Button>
      ) : null,
  };

  const tableColumns: DataTableColumnDef<ConfigEntry>[] = [
    {
      header: 'Configuration',
      accessorKey: 'name',
      cell: ({ row: { original: record } }) => {
        let name = <div className={`flex ${styles.nameText}`}>{record.name}</div>;
        if (renderTooltip) {
          name = renderTooltip(record, name);
        }

        const sensitive = record.isSensitive && (
          <Tooltip>
            <TooltipTrigger
              render={
                <div>
                  <EyeOffIcon className="text-brand" />
                </div>
              }
            />
            <TooltipContent side="top">Value has been redacted because it's sensitive</TooltipContent>
          </Tooltip>
        );

        return (
          <div className={styles.name}>
            {name}
            <span className={styles.configFlags}>{sensitive}</span>
          </div>
        );
      },
    },
    {
      header: 'Value',
      accessorKey: 'value',
      size: Number.POSITIVE_INFINITY,
      cell: ({ row: { original: record } }) => (
        <div className={`whitespace-break-spaces break-all ${styles.value}`}>
          {formatConfigValue(record.name, record.value, valueDisplay)}
        </div>
      ),
    },
  ];

  if (!allTypesUnknown) {
    tableColumns.push({
      header: 'Type',
      size: 120,
      accessorKey: 'type',
      cell: ({
        row: {
          original: { type },
        },
      }) => <span className={styles.type}>{type?.toLowerCase()}</span>,
    });
  }

  tableColumns.push({
    id: 'source',
    header: () => (
      <span className={styles.sourceHeader}>
        Source
        <Tooltip>
          <TooltipTrigger
            render={
              <div>
                <InfoIcon size={12} />
              </div>
            }
          />
          <TooltipContent side="left">
            <p>
              Resources can be configured at different levels. Example: A topic config may be inherited from the static
              broker config.
            </p>
            <p>
              Valid sources are: Dynamic Topic, Dynamic Broker, Default Broker, Static Broker, Dynamic Broker Logger and
              Default config.
            </p>
          </TooltipContent>
        </Tooltip>
      </span>
    ),
    size: 180,
    accessorKey: 'source',
    cell: ({
      row: {
        original: { source },
      },
    }) => <span className={styles.source}>{source?.toLowerCase().split('_').join(' ')}</span>,
  });

  return (
    <DataTable<ConfigEntry>
      columns={[expanderColumn, ...tableColumns]}
      data={configEntries}
      getRowCanExpand={(row) =>
        (row.original.synonyms?.filter((x) => x.source !== row.original.source).length ?? 0) > 0
      }
      pagination={false}
      rowClassName={(row) => (row.original.isExplicitlySet ? styles.overidden : styles.default)}
      sorting={false}
      subComponent={({ row }) => {
        if (!row.original.synonyms?.filter((x) => x.source !== row.original.source).length) {
          return null;
        }
        return (
          <div className="px-10 py-6">
            <DataTable<ConfigEntry>
              columns={tableColumns}
              // @ts-expect-error TODO - we need to fix types here and find a shared interface
              data={row.original.synonyms.filter((x) => x.source !== row.original.source)}
              pagination={false}
              sorting={false}
            />
          </div>
        );
      }}
    />
  );
}
