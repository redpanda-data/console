import React, { ReactNode, Component, CSSProperties } from "react";
import { Input, Pagination, Table } from "antd";
import { ColumnType } from "antd/lib/table";
import styles from './KowlTable.module.scss';
import { ExpandableConfig, TablePaginationConfig } from "antd/lib/table/interface";
import { uiState } from "../../state/uiState";
import { DEFAULT_TABLE_PAGE_SIZE } from "./common";
import { action, makeObservable, observable, transaction } from "mobx";
import { observer } from "mobx-react";
import { clone } from "../../utils/jsonUtils";
import { SearchOutlined } from "@ant-design/icons";
import Highlighter from "react-highlight-words";

@observer
export class KowlTable<T extends object = any> extends Component<{
    dataSource: readonly T[] | undefined
    columns: ColumnType<T>[],
    search?: {
        columnTitle: string,
        isRowMatch: (row: T, regex: RegExp) => boolean,
    }

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

    @observable filterOpen = false; // search bar visible
    filterActive = false; // search query present (independant of search bar visible)
    searchQuery?: string;
    searchRegex?: RegExp; // regex compiled from user search query

    searchColumn?: ColumnType<T>;

    constructor(p: any) {
        super(p);

        this.onFilter = this.onFilter.bind(this);

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

        this.observableSettings = this.props.observableSettings ?? observable({
            pageSize: paginationDefaultPageSize,
            quickSearch: '',
        });

        this.paginationVisible = this.props.pagination?.visible !== undefined
            ? this.props.pagination?.visible
            : true;

        if (this.props.search?.columnTitle) {
            this.searchColumn = this.props.columns.first(c => c.title == this.props.search?.columnTitle);
            // if (!this.searchColumn) throw new Error(`Couldn't find 'serachColumn' titled '${this.props.search?.columnTitle}'`);

            if (this.searchColumn) {
                const originalRender = this.searchColumn.render ?? ((value: any, record: T, index: number) => value);
                const originalTitle = String(this.searchColumn.title);

                this.searchColumn.title = <SearchTitle
                    title={originalTitle}
                    observableFilterOpen={this}
                    observableSettings={this.observableSettings}
                />;

                this.searchColumn.render = (v, record, index) => {
                    const userRender = originalRender(v, record, index);

                    if (!this.filterActive)
                        return userRender; // filter not active -> just render default

                    if (typeof userRender != 'string')
                        return userRender; // not something we can highlight

                    const query = this.observableSettings.quickSearch ?? '';
                    return <Highlighter searchWords={[query]} textToHighlight={userRender} autoEscape={true} />;
                };

                this.searchColumn.filterDropdown = <></>;
                this.searchColumn.onFilterDropdownVisibleChange = visible => {
                    // only accept requests to open the filter
                    if (visible)
                        this.filterOpen = visible;
                };
                // this.searchColumn.onFilter = this.onFilter;
            }
        }

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

        // Prepare SearchBar
        if (this.searchColumn) {
            const query = settings.quickSearch ?? "";
            this.filterActive = query.length > 1;
            let searchRegex: RegExp | undefined = undefined;
            if (this.filterActive) try { searchRegex = new RegExp(settings.quickSearch, 'i') } catch { }

            this.searchQuery = query;
            this.searchRegex = searchRegex;

            // this.searchColumn.filteredValue = this.filterActive ? [] : undefined;
            this.searchColumn.filterIcon = filterIcon(this.filterActive);
            this.searchColumn.filterDropdownVisible = this.filterOpen;
        }

        let data = p.dataSource;
        if (p.search && data && this.filterActive) {
            data = data.filter(r => this.onFilter(0, r));
        }

        return <Table<T>
            style={{ margin: '0', padding: '0' }}
            size="middle"
            showSorterTooltip={false}
            className={styles.kowlTable + " " + (p.className ?? '')}

            dataSource={data}
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
                        pageSize={this.pagination.pageSize}
                        pageSizeOptions={this.pagination.pageSizeOptions}

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

    onFilter(value: string | number | boolean, record: T): boolean {

        const isMatch = !this.searchRegex // todo: if query is set, but regex is not, then maybe make searchbar red?
            || !this.props.search?.isRowMatch // user didn't provide a filter
            || this.props.search.isRowMatch(record, this.searchRegex);

        console.log('onFilter', { regex: this.searchRegex, isRowMatchFn: this.props.search?.isRowMatch, result: isMatch });
        return isMatch;
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


@observer
export class SearchTitle extends Component<{
    title: string,
    observableFilterOpen: { filterOpen: boolean },
    observableSettings: { quickSearch: string },
}>
{
    inputRef = React.createRef<Input>(); // reference to input, used to focus it

    constructor(p: any) {
        super(p);
        this.hideSearchBar = this.hideSearchBar.bind(this);
        this.focusInput = this.focusInput.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    render() {
        const props = this.props;

        if (!props.observableFilterOpen.filterOpen)
            return this.props.title;

        // Render the actual search bar

        // inputRef won't be set yet, so we delay by one frame
        setImmediate(this.focusInput);

        return <span>
            <span >{this.props.title}</span>
            <div className="tableInlineSearchBox"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onMouseUp={e => e.stopPropagation()}
                style={{
                    position: 'absolute', top: 0, right: '36px', bottom: 0, left: 0,
                    display: 'flex', placeContent: 'center', placeItems: 'center',
                    padding: '4px 6px',
                }}
            >
                <Input
                    ref={this.inputRef}
                    onBlur={e => {
                        const inputWrapper = e.target.parentElement;
                        const focusInside = inputWrapper?.contains((e.relatedTarget as HTMLElement));

                        if (focusInside) {
                            // Most likely a click on the "clear" button
                            props.observableSettings.quickSearch = "";
                            this.hideSearchBar();
                        } else {
                            setTimeout(this.hideSearchBar);
                        }
                    }}
                    onKeyDown={this.onKeyDown}
                    allowClear={true}
                    placeholder="Enter search term/regex"
                    value={props.observableSettings.quickSearch}
                    onChange={e => props.observableSettings.quickSearch = e.target.value}
                    style={{ borderRadius: '3px' }}
                    spellCheck={false}
                />
            </div>
        </span>
    }

    focusInput() {
        this.inputRef.current?.focus();
    }

    hideSearchBar() {
        this.props.observableFilterOpen.filterOpen = false;
    }

    onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key == 'Enter' || e.key == 'Escape')
            this.hideSearchBar();
    }
}

function filterIcon(filterActive: boolean) {
    return <div className={filterActive ? 'tableFilterIcon active' : 'tableFilterIcon'}>
        <SearchOutlined />
    </div>
}

