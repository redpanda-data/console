import { EyeInvisibleTwoTone, InfoCircleFilled, LockOutlined } from '@ant-design/icons';
import { Popover, Table, Tooltip } from 'antd';
import React, { useState } from 'react';
import { ConfigEntry } from '../../state/restInterfaces';
import { ValueDisplay } from '../../state/ui';
import { formatConfigValue } from '../../utils/formatters/ConfigValueFormatter';
import { findPopupContainer } from '../../utils/tsxUtils';
import { sortField } from './common';

import styles from './ConfigList.module.scss';
import { KowlColumnType, KowlTable } from './KowlTable';

export function ConfigList({ configEntries, valueDisplay }: { configEntries: ConfigEntry[]; valueDisplay: ValueDisplay }) {
    const columns: KowlColumnType<ConfigEntry>[] = [
        {
            title: 'Configuration',
            dataIndex: 'name',
            render: (text: string, record: Partial<ConfigEntry>) => (
                <div className={styles.name}>
                    <Tooltip overlay={text} getPopupContainer={findPopupContainer} mouseEnterDelay={0.25}>
                        <span className={styles.nameText}>{text}</span>
                    </Tooltip>
                    {record.isSensitive && <span className={styles.configFlags}>
                        <Tooltip overlay="Value has been redacted because it's sensitive">
                            {record.isSensitive && <EyeInvisibleTwoTone twoToneColor="#1890ff" />}
                        </Tooltip>

                        {/* value reported by kafka seems to be wrong (?) so we'll not display the value */}
                        {/* {record.isReadOnly && <LockOutlined twoToneColor="#1890ff" style={{ color: '#1890ff' }} />} */}
                    </span>}
                </div>
            )
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
            title: 'Type',
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
            dataIndex: 'source',
            render: (text: string) =>
                <span className={styles.source}>{text
                    .toLowerCase()
                    .split('_')
                    .join(' ')}
                </span>,
            filterType: { type: 'enum' },
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
