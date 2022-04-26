import { EditTwoTone, EyeInvisibleTwoTone, InfoCircleFilled, LockOutlined, LockTwoTone } from '@ant-design/icons';
import { Popover, Table, Tooltip } from 'antd';
import React, { useState } from 'react';
import { ConfigEntry } from '../../state/restInterfaces';
import { ValueDisplay } from '../../state/ui';
import { formatConfigValue } from '../../utils/formatters/ConfigValueFormatter';
import { findPopupContainer } from '../../utils/tsxUtils';
import { sortField } from './common';

import styles from './ConfigList.module.scss';
import { KowlColumnType, KowlTable } from './KowlTable';

export function ConfigList({ configEntries, valueDisplay, renderTooltip }: { configEntries: ConfigEntry[]; valueDisplay: ValueDisplay, renderTooltip?: (e: ConfigEntry, content: JSX.Element) => JSX.Element }) {

    const columns: KowlColumnType<ConfigEntry>[] = [
        {
            title: 'Configuration',
            dataIndex: 'name',
            render: (text: string, record: ConfigEntry) => {

                let name = <div style={{ display: 'flex' }} className={styles.nameText}>{text}</div>;
                if (renderTooltip) name = renderTooltip(record, name);

                const explicitSet = record.isExplicitlySet && (
                    <Tooltip overlay="Value was set explicitly">
                        <EditTwoTone twoToneColor="#1890ff" />
                    </Tooltip>
                );
                const sensitive = record.isSensitive && (
                    <Tooltip overlay="Value has been redacted because it's sensitive">
                        <EyeInvisibleTwoTone twoToneColor="#1890ff" />
                    </Tooltip>
                );

                return <div className={styles.name}>
                    {name}
                    <span className={styles.configFlags}>
                        {/* {explicitSet} */}
                        {sensitive}
                    </span>
                </div>;
            }
        },
        {
            title: 'Value',
            dataIndex: 'value',
            render: (_: unknown, record: Partial<ConfigEntry>) => (
                <span className={styles.value}>
                    {formatConfigValue(record.name as string, record.value as string, valueDisplay)}
                </span>
            ),
        },
        {
            title: 'Type', width: '120px',
            dataIndex: 'type',
            render: (text: string) => <span className={styles.type}>{text?.toLowerCase()}</span>,
            filterType: { type: 'enum', toDisplay: x => String(x).toLowerCase(), optionClassName: 'capitalize' },
            sorter: sortField('type')
        },
        {
            title: (
                <span className={styles.sourceHeader}>
                    Source
                    <Tooltip
                        overlay={<div style={{ width: '300px', textAlign: 'left' }}><p>Resources can be configured at different levels. Example: A topic config may be inherited from the static broker config.</p><p>Valid sources are: Dynamic Topic, Dynamic Broker, Default Broker, Static Broker, Dynamic Broker Logger and Default config.</p></div>}
                        title="Source"
                        trigger="hover"
                        placement="left"
                        getPopupContainer={findPopupContainer}>
                        <InfoCircleFilled style={{ color: '#bbbbbb' }} />
                    </Tooltip>
                </span>
            ),
            dataIndex: 'source', width: '180px',
            render: (text: string) =>
                <span className={styles.source}>{text
                    .toLowerCase()
                    .split('_')
                    .join(' ')}
                </span>,
            filterType: { type: 'enum', toDisplay: x => x.toLowerCase().split('_').join(' '), optionClassName: 'capitalize' },
            sorter: sortField('source')

        },
    ];

    return (
        <KowlTable className={styles.configEntryTable}

            dataSource={configEntries}
            columns={columns}

            pagination={{
                visible: false,
                defaultPageSize: 10000,
            }}

            expandable={{
                childrenColumnName: "synonyms",
                indentSize: 20,
            }}
            search={{
                searchColumnIndex: 0,
                isRowMatch: (row, regex) => {
                    if (row.name && regex.test(row.name)) return true;
                    if (row.value && regex.test(row.value)) return true;
                    return false;
                }
            }}

            rowKey="name"
            rowClassName={(record) => (record.isExplicitlySet ? styles.overidden : styles.default)}
        />
    );
}
