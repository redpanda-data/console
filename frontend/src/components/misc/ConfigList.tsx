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

import { EyeInvisibleTwoTone, InfoCircleFilled } from '@ant-design/icons';
import colors from '../../colors';
import { ConfigEntry } from '../../state/restInterfaces';
import { ValueDisplay } from '../../state/ui';
import { formatConfigValue } from '../../utils/formatters/ConfigValueFormatter';
import { equalsIgnoreCase } from '../../utils/utils';

import styles from './ConfigList.module.scss';

import { DataTable, Flex, Tooltip } from '@redpanda-data/ui';
import { ColumnDef } from '@tanstack/react-table';

export function ConfigList({ configEntries, valueDisplay, renderTooltip }: { configEntries: ConfigEntry[]; valueDisplay: ValueDisplay; renderTooltip?: (e: ConfigEntry, content: JSX.Element) => JSX.Element }) {
    const allTypesUnknown = configEntries.all(x => equalsIgnoreCase(x.type, 'unknown'));

    const tableColumns: ColumnDef<ConfigEntry>[] = [
        {
            header: 'Configuration',
            accessorKey: 'name',
            cell: ({row: {original: record}}) => {
                let name = (
                    <Flex className={styles.nameText}>
                        {record.name}
                    </Flex>
                );
                if (renderTooltip) name = renderTooltip(record, name);

                const sensitive = record.isSensitive && (
                    <Tooltip label="Value has been redacted because it's sensitive" placement="top" hasArrow>
                        <EyeInvisibleTwoTone twoToneColor={colors.brandOrange}/>
                    </Tooltip>
                );

                return (
                    <div className={styles.name}>
                        {name}
                        <span className={styles.configFlags}>{sensitive}</span>
                    </div>
                );
            }
        },
        {
            header: 'Value',
            accessorKey: 'value',
            cell: ({row: {original: record}}) => <span
                className={styles.value}>{formatConfigValue(record.name, record.value, valueDisplay)}</span>
        },
    ]

    if (!allTypesUnknown) {
        tableColumns.push({
            header: 'Type',
            size: 120,
            accessorKey: 'type',
            cell: ({row: {original: {type}}}) => <span className={styles.type}>{type?.toLowerCase()}</span>
        })
    }

    tableColumns.push({
        id: 'source',
        header: () => (
            <span className={styles.sourceHeader}>
                Source
                <Tooltip
                    label={
                        <>
                            <p>Resources can be configured at different levels. Example: A topic config may be inherited
                                from the static broker config.</p>
                            <p>Valid sources are: Dynamic Topic, Dynamic Broker, Default Broker, Static Broker, Dynamic
                                Broker Logger and Default config.</p>
                        </>
                    }
                    placement="left"
                    hasArrow
                >
                    <InfoCircleFilled style={{color: '#bbbbbb'}}/>
                </Tooltip>
            </span>
        ),
        size: 180,
        accessorKey: 'source',
        cell: ({row: {original: {source}}}) => <span
            className={styles.source}>{source?.toLowerCase().split('_').join(' ')}</span>
    })

    return (
        <DataTable<ConfigEntry>
            data={configEntries}
            showPagination={false}
            enableSorting={false}
            defaultPageSize={10000}
            size="md"
            getRowCanExpand={row => (row.original.synonyms?.length ?? 0) > 0 }
            // getSubRows={row => row.synonyms as ConfigEntry[]}
            subComponent={({row}) => {
                if(!row.original.synonyms?.length) {
                    return null
                }
                return <DataTable<ConfigEntry>
                    // @ts-ignore TODO - we need to fix types here and find a shared interface
                    data={row.original.synonyms}
                    columns={tableColumns}
                />
            }}
            rowClassName={(row) => (row.original.isExplicitlySet ? styles.overidden : styles.default)}
            columns={tableColumns}
        />
    );
}
