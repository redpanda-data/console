import React, { ReactNode, Component, CSSProperties } from "react";
import { Pagination, Table } from "antd";
import { ColumnType } from "antd/lib/table";
import styles from './KowlTable.module.scss';


export class KowlTable<T extends object = any> extends Component<{

    dataSource: readonly T[] | undefined
    columns: ColumnType<T>[],

    rowKey: (record: T) => string | number,
    onRow?: ((data: T, index?: number) => React.HTMLAttributes<HTMLElement>) | undefined,
    rowClassName?: string | ((record: T, index: number) => string) | undefined,

    className?: string
}> {

    // pagination
    // auto set 'sorter' on column

    render() {
        const p = this.props;

        return <Table<T>
            dataSource={p.dataSource}
            columns={p.columns}

            rowKey={p.rowKey}
            rowClassName={p.rowClassName}
            onRow={p.onRow}

            // pagination={this.pageConfig}
            // onChange={(pagination) => {
            //     if (pagination.pageSize) uiSettings.topicList.pageSize = pagination.pageSize;
            //     this.pageConfig.current = pagination.current;
            //     this.pageConfig.pageSize = pagination.pageSize;
            // }}
            pagination={{
                position: [],

            }}

            onChange={(pagination, filters, sorters, extra) => {
                console.log('onChange', {
                    pagination, filters, sorters, extra
                });
            }}

            footer={ar => (
                <Pagination
                    // size="small"
                    showSizeChanger
                    total={ar.length}
                    showTotal={(total) => <span className='paginationTotal'>Total {total} items</span>}
                />
            )}



            style={{ margin: '0', padding: '0' }}
            size="middle"
            showSorterTooltip={false}
            className={styles.kowlTable + " " + (p.className ?? '')}
        />
    }
}

interface TableSettings {
    a: string;
}