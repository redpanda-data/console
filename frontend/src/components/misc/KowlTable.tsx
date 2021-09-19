import React, { ReactNode, Component, CSSProperties } from "react";
import { Button, Checkbox, Input, Menu, Pagination, Table } from "antd";
import { ColumnType } from "antd/lib/table";
import styles from './KowlTable.module.scss';
import { ColumnFilterItem, ColumnTitleProps, ExpandableConfig, FilterDropdownProps, TablePaginationConfig } from "antd/lib/table/interface";
import { uiState } from "../../state/uiState";
import { DEFAULT_TABLE_PAGE_SIZE } from "./common";
import { action, autorun, comparer, computed, IReactionDisposer, IReactionPublic, makeObservable, observable, reaction, transaction } from "mobx";
import { observer } from "mobx-react";
import { clone } from "../../utils/jsonUtils";
import { SearchOutlined } from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import { findPopupContainer } from "../../utils/tsxUtils";

type EnumFilter = {
    type: 'enum',
    filterEnumOptions?: {
        value: any;
        displayName?: string;
    }[];
    optionClassName?: string;
    toDisplay?: (value: any) => string,
};

type NumericFilter = {
    type: 'numeric',
};

//type antdFilterProps = 'filters' | 'filterDropdown' | 'filterDropdownVisible' | 'filterIcon' | 'filterMultiple' | 'filtered' | 'filteredValue' | 'onFilter' | 'onFilterDropdownVisibleChange' | 'defaultFilteredValue';
type antdFilterProps = 'defaultFilteredValue';

export type KowlColumnType<T> = Omit<ColumnType<T>, antdFilterProps | 'render'> & {
    filterType?: EnumFilter | NumericFilter;
    render?: (value: any, record: T, index: number, highlight: (text: string) => JSX.Element) => React.ReactNode;
};

type KowlColumnTypeInternal<T> = ColumnType<T> & {
    filterType?: EnumFilter | NumericFilter;
    render?: (value: any, record: T, index: number) => React.ReactNode;
};

@observer
export class KowlTable<T extends object = any> extends Component<{
    dataSource: readonly T[] | undefined
    columns: KowlColumnType<T>[],
    search?: {
        searchColumnIndex?: number;
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
    currentDataSource: readonly T[] = [];

    @observable filterOpen = false; // search bar visible
    filterActive = false; // search query present (independant of search bar visible)
    searchQuery?: string;
    searchRegex?: RegExp; // regex compiled from user search query

    customColumns: KowlColumnTypeInternal<T>[] = [];
    searchColumn?: KowlColumnTypeInternal<T>;

    reactionDisposers: IReactionDisposer[] = [];

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

        makeObservable(this);

        const disposers = this.reactionDisposers;
        const ar = function <T>(data: () => T, effect: (prev: T, cur: T, count: number) => void, delay?: number) {
            let count = 0;
            const newEffect = (cur: any, prev: any, r: IReactionPublic) => {
                effect(prev, cur, ++count);
            };
            const d = reaction(data, newEffect, {
                equals: customComparerIsSame,
                delay: delay,
                fireImmediately: true,
            });
            disposers.push(d);

            // effect(undefined as any as T, data(), 0);
        }

        // Ensure our custom columns are up to date
        ar(() => this.props.columns, (prev, cur, count) => {
            // console.log('columns changed ' + count, { prev, cur });
            this.updateCustomColumns(cur);
        });

        // Keep our columns up to date (to learn about new values for filtering)
        ar(() => this.props.dataSource, (prev, cur, count) => {
            // console.log('dataSource changed ' + count, { prev, cur });
            this.ensureFiltersAreUpdated(cur);
        });

        // Keep search column up to date ('active state' of the filter icon etc)
        ar(() => ({ query: this.observableSettings.quickSearch, searchColumn: this.searchColumn, filterOpen: this.filterOpen, oriCols: this.props.columns }), (prev, cur, count) => {
            const { searchColumn } = cur;

            if (cur.query && cur.query.length > 0) {
                this.filterActive = true;
                let searchRegex: RegExp | undefined = undefined;
                if (this.filterActive) try { searchRegex = new RegExp(cur.query, 'i') } catch { }

                this.searchQuery = cur.query;
                this.searchRegex = searchRegex;
            }
            else {
                this.filterActive = false;
                this.searchQuery = undefined;
                this.searchRegex = undefined;
            }

            if (searchColumn) {
                searchColumn.filterIcon = this.filterIcon;
                searchColumn.filterDropdownVisible = false;
            }
        });

        // update display data
        ar(() => ({ data: this.props.dataSource, filterActive: this.filterActive, query: this.observableSettings?.quickSearch }), (prev, cur, count) => {
            const { data, filterActive, query } = cur;
            // console.warn('update DisplayData', { data, filterActive, query, "this.displayData": this.displayData });
            if (!data) return;

            if (filterActive) {
                this.displayData = data.filter(this.onFilter);
            } else {
                this.displayData = data;
            }
        }, 150);
    }

    componentWillUnmount() {
        for (const r of this.reactionDisposers)
            r();
    }

    @action updateCustomColumns(cols: KowlColumnType<T>[]) {
        // console.count('table update columns');
        this.customColumns = cols.map(col => Object.assign({}, col)) as KowlColumnTypeInternal<T>[];
        this.searchColumn = undefined;
        this.updateSearchColumn(this.customColumns);
    }

    @action updateSearchColumn(cols: KowlColumnType<T>[]) {
        // console.count('table update search');

        const props = this.props;
        if (props.search?.searchColumnIndex == undefined) return;

        // Lookup
        this.searchColumn = cols[props.search.searchColumnIndex] as KowlColumnTypeInternal<T> | undefined;
        if (!this.searchColumn) {
            console.warn('search column index is invalid', { index: props.search.searchColumnIndex, columns: cols });
            return;
        }

        // Title
        const originalTitle = String(this.searchColumn.title);
        this.searchColumn.title = (props: ColumnTitleProps<T>) => {
            return <SearchTitle
                title={originalTitle}
                observableFilterOpen={this}
                observableSettings={this.observableSettings}
            />
        };

        // Content Render
        const userRender = this.searchColumn.render as undefined | ((v: any, r: T, i: number, h: (text: string) => JSX.Element) => JSX.Element);
        this.searchColumn.render = (cellValue: any, record: T, index: number) => {
            const query = this.filterActive
                ? this.observableSettings.quickSearch ?? ''
                : undefined;

            const highlight = query
                ? (text: string) => <Highlighter searchWords={[query]} textToHighlight={text} autoEscape={true} />
                : (text: string) => <>{text}</>;

            if (userRender == undefined) {
                // active search, but user leaves rendering to us
                if (query && typeof cellValue == 'string')
                    return highlight(cellValue);

                // no search, no custom rendering
                return cellValue;
            }
            else {
                // let user handle it
                return userRender(cellValue, record, index, highlight);
            }
        };

        this.searchColumn.filterDropdown = (p) => null;
        this.searchColumn.onFilterDropdownVisibleChange = visible => {
            // only accept requests to open the filter
            if (visible)
                this.filterOpen = visible;
            this.searchColumn!.filterDropdownVisible = false;
        };
    }

    @action ensureFiltersAreUpdated(data: readonly T[] | undefined) {
        // Filter columns
        for (const col of this.customColumns) {

            if (col.filterType == undefined) continue;
            if (col.filterType.type == 'enum') {

                // Add user defined values
                col.filters = col.filterType.filterEnumOptions?.map(e => ({
                    text: e.displayName ?? e.value,
                    value: e.value,
                })) ?? [];

                // Add missing values
                if (typeof col.dataIndex == 'string' && data) {
                    const givenValues = new Set(col.filterType.filterEnumOptions?.map(x => x.value) ?? []);

                    for (const row of data) {
                        const val = (row as any)[col.dataIndex];

                        if (!val) continue; // no empty/null
                        if (typeof val != 'string' && typeof val != 'number') continue; // only string/num
                        if (givenValues.has(val)) continue; // no duplicates

                        givenValues.add(val);
                        const display = col.filterType.toDisplay?.(val) ?? String(val);
                        col.filters.push({ value: val, text: display });
                    }
                }

                // Enum filtering
                // for now only string dataIndex is supported;
                // number and array types might be added later
                col.onFilter = (filterValue, rec: T) => {
                    // is this row a match?
                    if (typeof col.dataIndex == 'string') {
                        const val = (rec as any)[col.dataIndex];
                        return val == filterValue;
                    }

                    return true;
                };

                const optionClass = col.filterType.optionClassName ?? '';

                col.filterDropdown = (p: FilterDropdownProps) => {

                    return <>
                        <div style={{ minWidth: '200px' }}>
                            {p.filters?.map(f =>
                                <li key={f.text + String(f.value)} className='ant-dropdown-menu-item' style={{ position: 'relative' }}>
                                    <Checkbox
                                        className={'filterCheckbox ' + optionClass}
                                        checked={p.selectedKeys.includes(f.value as React.Key)}
                                        onChange={e => {
                                            const newKeys = e.target.checked
                                                ? [...p.selectedKeys, f.value as React.Key]
                                                : p.selectedKeys.filter(x => x != f.value);

                                            p.setSelectedKeys(newKeys);
                                            p.confirm({ closeDropdown: false });
                                        }}
                                    >
                                        {f.text}
                                    </Checkbox>
                                </li>
                            )}
                        </div>
                    </>
                };
            }
        }
    }

    @observable displayData: readonly T[] = [];

    renderCount = 0;
    render() {
        const p = this.props;
        if (p.dataSource)
            this.currentDataSource = p.dataSource;

        const settings = this.observableSettings;
        const pagination = this.pagination;

        // trigger mobx update
        const unused1 = pagination.pageSize;
        const unused2 = pagination.current;

        return <>
            <Table<T>
                style={{ margin: '0', padding: '0' }}
                size="middle"
                showSorterTooltip={false}
                className={styles.kowlTable + " " + (p.className ?? '')}

                dataSource={this.displayData}
                columns={this.customColumns}

                rowKey={p.rowKey}
                rowClassName={p.rowClassName}
                onRow={p.onRow}

                pagination={pagination}

                getPopupContainer={findPopupContainer}
                expandable={p.expandable}
                footer={currentView => {
                    // todo: additional footer elements
                    // console.log('footer', clone({ pagination: pagination, settings: settings }));
                    if (!this.paginationVisible) return null;

                    return <Pagination size="small" showSizeChanger
                        total={this.currentDataSource.length}
                        showTotal={(total) => {
                            const shown = currentView.length;
                            return <span className='paginationTotal'>{
                                (shown == total)
                                    ? `Total ${total} items`
                                    : `Showing ${shown} of ${total} items`
                            }
                            </span>
                        }}
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
                }}
            />

        </>
    }

    @computed get filterIcon() {
        return filterIcon(this.filterActive);
    }

    onFilter(record: T): boolean {

        let isMatch: boolean;
        const regex = this.searchRegex;

        if (!regex) {
            // Query was set, but regex is not...
            // We can't search.
            // Maybe we should color the searchbar red?
            isMatch = true;
        }
        else {
            const filter = this.props.search?.isRowMatch;
            if (!filter) {
                // user did not provide a filter...
                isMatch = true;
            }
            else {
                isMatch = filter(record, regex);
            }
        }

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

                    onChange={e => {
                        props.observableSettings.quickSearch = e.target.value;
                    }}
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

// like structural comparer, but ignores functions
function customComparerIsSame<T>(a: T, b: T, remainingDepth?: number): boolean {
    if (remainingDepth == undefined) remainingDepth = 5;
    if (remainingDepth != undefined && remainingDepth <= 0) return true;


    if (a === undefined && b === undefined) return true;
    if (a === null && b === null) return true;
    if (!a && b) return false;
    if (a && !b) return false;
    if (typeof a != typeof b) return false;

    if (typeof a == 'function')
        // consider functions always the same
        return true;

    if (typeof a != 'object')
        // primitive
        return a == b;

    // react object
    const tt = (a as any)['$$typeof'];
    if (tt == Symbol('react.element'))
        // ignore changes to react components
        return true;

    // normal object
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);

    if (aKeys.length != bKeys.length) return false;

    for (let i = 0; i < aKeys.length; i++) {
        if (aKeys[i] != bKeys[i]) return false;

        const aVal = (a as any)[aKeys[i]];
        const bVal = (b as any)[bKeys[i]];

        if (typeof aVal != typeof bVal)
            return false;

        if (!customComparerIsSame(aVal, bVal, remainingDepth - 1))
            return false;
    }

    return true;
}


function debounceEffect<T>(effect: (arg: T, r: IReactionPublic) => void, debounceMs: number) {
    let timer: NodeJS.Timeout;
    return (arg: T, r: IReactionPublic) => {
        clearTimeout(timer)
        timer = setTimeout(() => effect(arg, r), debounceMs)
    }
}