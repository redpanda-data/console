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

import React, { Component } from 'react';
import { ColumnType } from 'antd/lib/table';
import { observer } from 'mobx-react';
import { Box, Input } from '@redpanda-data/ui';

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
    //dataIndex: keyof T | string[];
};

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


@observer
export class SearchTitle extends Component<{
    title: string,
    observableFilterOpen: { filterOpen: boolean },
    observableSettings: { quickSearch: string },
}>
{
    inputRef = React.createRef<HTMLInputElement>(); // reference to input, used to focus it

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
        setTimeout(this.focusInput);

        return <span>
            {!props.observableFilterOpen.filterOpen && <span>{this.props.title}</span>}
            <Box
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onMouseUp={e => e.stopPropagation()}
                style={{
                    position: 'absolute', inset: '0px 0px 0px -8px',
                    display: 'flex', placeContent: 'center', placeItems: 'center'
                }}
            >
                <Input
                    ref={this.inputRef}
                    onBlur={e => {
                        const inputWrapper = e.target.parentElement;
                        const focusInside = inputWrapper?.contains((e.relatedTarget as HTMLElement));

                        if (focusInside) {
                            // Most likely a click on the "clear" button
                            props.observableSettings.quickSearch = '';
                            this.hideSearchBar();
                        } else {
                            setTimeout(this.hideSearchBar);
                        }
                    }}
                    onKeyDown={this.onKeyDown}
                    placeholder="Enter search term/regex"
                    value={props.observableSettings.quickSearch}

                    onChange={e => {
                        props.observableSettings.quickSearch = e.target.value;
                    }}
                    spellCheck={false}
                />
            </Box>
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
