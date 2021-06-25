import React, { ReactNode, Component, CSSProperties } from "react";
import { Pagination, Table } from "antd";
import { ColumnType } from "antd/lib/table";
import styles from './KowlTable.module.scss';
import { ExpandableConfig, TablePaginationConfig } from "antd/lib/table/interface";
import { uiState } from "../../state/uiState";
import { DEFAULT_TABLE_PAGE_SIZE } from "./common";
import { makeObservable, observable, transaction } from "mobx";
import { observer } from "mobx-react";
import { clone } from "../../utils/jsonUtils";

@observer
export class KowlTable<T extends object = any> extends Component<{
    dataSource: readonly T[] | undefined
    columns: ColumnType<T>[],

    observableSettings?: TableSettings,
    pagination?: {
        visible?: boolean,
        defaultPageSize?: number,
        pageSizeOptions?: string[],
    },

    rowKey?: string | ((record: T) => string | number),
    onRow?: ((data: T, index?: number) => React.HTMLAttributes<HTMLElement>) | undefined,
    rowClassName?: string | ((record: T, index: number) => string) | undefined,

    expandable?: ExpandableConfig<T>,
    className?: string

}> {

    paginationVisible: boolean;
    @observable observableSettings: TableSettings;
    @observable pagination: TablePaginationConfig;
    @observable currentDataSource: readonly T[] = [];

    constructor(p: any) {
        super(p);

        const paginationDefaultPageSize = this.props.observableSettings?.pageSize ?? this.props.pagination?.defaultPageSize ?? DEFAULT_TABLE_PAGE_SIZE;
        const paginationSizeOptions = this.props.pagination?.pageSizeOptions ?? ['10', '20', '50', '100'];

        this.pagination = {
            pageSize: paginationDefaultPageSize,
            pageSizeOptions: paginationSizeOptions,
            defaultCurrent: 1,
            current: 1,
            showSizeChanger: true,
            position: [],
            hideOnSinglePage: false,
        };

        this.observableSettings = this.props.observableSettings ?? {
            pageSize: paginationDefaultPageSize,
            quickSearch: '',
        }

        this.paginationVisible = this.props.pagination?.visible !== undefined
            ? this.props.pagination?.visible
            : true;

        makeObservable(this);
    }

    render() {
        const p = this.props;
        if (p.dataSource) this.currentDataSource = p.dataSource;

        const settings = this.observableSettings;
        const pagination = this.pagination;

        // trigger mobx update
        const unused1 = pagination.pageSize;
        const unused2 = pagination.current;


        return <Table<T>
            style={{ margin: '0', padding: '0' }}
            size="middle"
            showSorterTooltip={false}
            className={styles.kowlTable + " " + (p.className ?? '')}

            dataSource={p.dataSource}
            columns={p.columns}

            rowKey={p.rowKey}
            rowClassName={p.rowClassName}
            onRow={p.onRow}

            pagination={pagination}

            expandable={p.expandable}
            footer={currentView => {
                // todo: additional footer elements
                // console.log('footer', clone({ pagination: pagination, settings: settings }));
                if (currentView.length == 0) return null;

                if (this.paginationVisible) {
                    return <Pagination size="small" showSizeChanger
                        total={this.currentDataSource.length}
                        showTotal={(total) => <span className='paginationTotal'>Total {total} items</span>}

                        current={this.pagination.current ?? this.pagination.defaultCurrent}
                        onChange={(page, pageSize) => {
                            // console.log('Pagination.onChange', { page: page, pageSize: pageSize });

                            transaction(() => {
                                pagination.current = page;
                                if (pageSize != undefined) {
                                    pagination.pageSize = pageSize;
                                    settings.pageSize = pageSize;
                                }
                            });
                        }}
                    />
                }
            }}
        />;
    }
}

// sorter:  SorterResult<T>|SorterResult<T>[]
//
// export interface SorterResult<RecordType> {
//     column?: ColumnType<RecordType>;
//     order?: SortOrder;
//     field?: Key | readonly Key[];
//     columnKey?: Key;
// }
//
//
// When defining sorter:
//   sorter: { compare: (a, b) => a.chinese - b.chinese, multiple: 3, }
// 'multiple' defines priority (sorters are evaluated in ascending order, so sorters with lower 'multiple' come first)

export type TableSettings = {
    pageSize: number; // pagination.pageSize
    quickSearch: string;

    // sorters: {
    //     columnName: string;
    //     direction: 'ascending' | 'descending';
    // }[];

    // todo:
    // - settings for which columns to search yet
    // - settings for column width or visibility yet
};