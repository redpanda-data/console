import { EyeInvisibleTwoTone, InfoCircleFilled, LockOutlined } from '@ant-design/icons';
import { Popover, Table, Tooltip } from 'antd';
import React, { useState } from 'react';
import { ConfigEntry } from '../../state/restInterfaces';
import { ValueDisplay } from '../../state/ui';
import { formatConfigValue } from '../../utils/formatters/ConfigValueFormatter';
import { findPopupContainer } from '../../utils/tsxUtils';

import styles from './ConfigList.module.scss';
import { KowlTable } from './KowlTable';

function filterRedundantSynonyms({ synonyms, ...rest }: ConfigEntry): Partial<ConfigEntry> {
    if (synonyms?.length <= 1) {
        return rest;
    }

    return { ...rest, synonyms: synonyms.slice(1) };
}


export function ConfigList({ configEntries, valueDisplay }: { configEntries: ConfigEntry[]; valueDisplay: ValueDisplay }) {
    const columns = [
        {
            title: 'Configuration',
            dataIndex: 'name',
            render: (text: string, record: Partial<ConfigEntry>) => (
                <div className={styles.name}>
                    <Popover content={text} trigger={['click']} getPopupContainer={findPopupContainer}>
                        <span className={styles.nameText}>
                            {text}
                        </span>
                    </Popover>
                    <span className={styles.configFlags}>
                        <Tooltip overlay="Value has been redacted because it's sensitive">
                            {record.isSensitive && <EyeInvisibleTwoTone twoToneColor="#1890ff" />}
                        </Tooltip>

                        {/* value reported by kafka seems to be wrong (?) so we'll not display the value */}
                        {/* {record.isReadOnly && <LockOutlined twoToneColor="#1890ff" style={{ color: '#1890ff' }} />} */}
                    </span>
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
            render: (text: string) => <span className={styles.type}>{text?.toLowerCase()}</span>
        },
        {
            title: (
                <span className={styles.sourceHeader}>
                    Source
                    <Popover content={<div style={{ width: '300px' }}><p>Resources can be configured at different levels. Example: A topic config may be inherited from the static broker config.</p><p>Valid sources are: Dynamic Topic, Dynamic Broker, Default Broker, Static Broker, Dynamic Broker Logger and Default config.</p></div>}
                        title="Source" trigger="hover" placement="left" getPopupContainer={findPopupContainer}>
                        <InfoCircleFilled style={{ color: '#bbbbbb' }} />
                    </Popover>
                </span>
            ),
            dataIndex: 'source',
            render: (text: string) =>
                <span className={styles.source}>{text
                    .toLowerCase()
                    .split('_')
                    .map((s) => s.replace(/^\w/, (c) => c.toUpperCase()))
                    .join(' ')}
                </span>,
        },
    ];
    return (
        <KowlTable className={styles.configEntryTable}

            dataSource={configEntries.map(filterRedundantSynonyms)}
            columns={columns}

            pagination={{
                visible: false,
                defaultPageSize: 10000,
            }}

            expandable={{
                childrenColumnName: "synonyms",
                indentSize: 20,
            }}

            rowKey="name"
            rowClassName={(record) => (record.isExplicitlySet ? styles.overidden : styles.default)}
        />
    );
}
