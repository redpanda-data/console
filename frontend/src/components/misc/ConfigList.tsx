import { EyeInvisibleTwoTone, InfoCircleFilled, LockOutlined } from '@ant-design/icons';
import { Popover, Table } from 'antd';
import React from 'react';
import { ConfigEntry } from '../../state/restInterfaces';
import { ValueDisplay } from '../../state/ui';
import { formatConfigValue } from '../../utils/formatters/ConfigValueFormatter';

import styles from './ConfigList.module.scss';

function filterRedundantSynonyms({ synonyms, ...rest }: ConfigEntry): Partial<ConfigEntry> {
    if (synonyms?.length <= 1) {
        return rest;
    }

    return { ...rest, synonyms: synonyms.slice(1) };
}

export function ConfigList({ configEntries, valueDisplay }: { configEntries: ConfigEntry[]; valueDisplay: ValueDisplay }) {
    const columns = [
        { title: 'Configuration', dataIndex: 'name', render: (text: string) => <span className={styles.name}>{text}</span> },
        {
            title: 'Value',
            dataIndex: 'value',
            render: (_: unknown, record: Partial<ConfigEntry>) => {
                return (
                    <>
                        {formatConfigValue(record.name as string, record.value as string, valueDisplay)}
                        &nbsp;
                        {record.isReadOnly ? <LockOutlined twoToneColor="#1890ff" style={{ color: '#1890ff' }} /> : null}
                        {record.isSensitive ? <EyeInvisibleTwoTone twoToneColor="#1890ff" /> : null}
                    </>
                );
            },
        },
        { title: 'Type', dataIndex: 'type', render: (text: string) => <span className={styles.type}>{text?.toLowerCase()}</span> },
        {
            title: (
                <span className={styles.sourceHeader}>
                    Source
                    <Popover content={"Some text that describes what 'Source' is. Yet TBD."} title="Source" trigger="hover" placement="left">
                        <InfoCircleFilled style={{ color: '#bbbbbb' }} />
                    </Popover>
                </span>
            ),
            dataIndex: 'source',
            render: (text: string) =>
                text
                    .toLowerCase()
                    .split('_')
                    .map((s) => s.replace(/^\w/, (c) => c.toUpperCase()))
                    .join(' '),
        },
    ];
    return (
        <Table
            rowKey="name"
            dataSource={configEntries.map(filterRedundantSynonyms)}
            childrenColumnName="synonyms"
            columns={columns}
            rowClassName={(record) => (record.isExplicitlySet ? styles.overidden : styles.default)}
            pagination={false}
            size="middle"
            className={styles.configEntryTable}
            indentSize={20}
        />
    );
}
