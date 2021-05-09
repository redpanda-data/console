import { EyeInvisibleTwoTone, InfoCircleFilled, LockOutlined } from '@ant-design/icons';
import { Popover, Table } from 'antd';
import React, { useState } from 'react';
import { ConfigEntry } from '../../state/restInterfaces';
import { ValueDisplay } from '../../state/ui';
import { formatConfigValue } from '../../utils/formatters/ConfigValueFormatter';
import { findPopupContainer } from '../../utils/tsxUtils';

import styles from './ConfigList.module.scss';

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
                        {record.isSensitive && <EyeInvisibleTwoTone twoToneColor="#1890ff" />}
                        {record.isReadOnly && <LockOutlined twoToneColor="#1890ff" style={{ color: '#1890ff' }} />}
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
                    <Popover content={"Some text that describes what 'Source' is. Yet TBD."} title="Source" trigger="hover" placement="left" getPopupContainer={findPopupContainer}>
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
        <Table size="middle" className={styles.configEntryTable}

            dataSource={configEntries.map(filterRedundantSynonyms)}
            columns={columns}

            expandable={{
                childrenColumnName: "synonyms",
                indentSize: 20,
            }}

            rowKey="name"
            rowClassName={(record) => (record.isExplicitlySet ? styles.overidden : styles.default)}

            pagination={false}
        />
    );
}
