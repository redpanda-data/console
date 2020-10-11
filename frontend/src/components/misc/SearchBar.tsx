import { Checkbox, Input } from 'antd';
import { AnimatePresence } from 'framer-motion';
import { autorun, IReactionDisposer, transaction } from 'mobx';
import { observer } from 'mobx-react';
import React, { Component } from 'react'
import { animProps_span_searchResult, MotionSpan } from '../../utils/animationProps';
import { FilterableDataSource } from '../../utils/filterableDataSource';

// todo: extract out where the filterText is retreived from / saved.
//       this component was originally extracted out of another component, but we probably want to re-use it elsewhere in the future
@observer
class SearchBar<TItem> extends Component<{
    dataSource: () => TItem[],
    isFilterMatch: (filter: string, item: TItem) => boolean,
    filterText: string,
    onQueryChanged: (value: string) => void,
    onFilteredDataChanged: (data: TItem[]) => void,
}> {

    private filteredSource = {} as FilterableDataSource<TItem>;
    get data() { return this.filteredSource.data; }
    autorunDisposer: IReactionDisposer | undefined = undefined;

    /*
        todo: autocomplete:
        - save as suggestion on focus lost, enter, or clear
        - only show entries with matching start
    */
    // todo: allow setting custom "rows" to search, and case sensitive or not (pass those along to isFilterMatch)

    constructor(p: any) {
        super(p);
        this.filteredSource = new FilterableDataSource<TItem>(this.props.dataSource, this.props.isFilterMatch);
        this.filteredSource.filterText = this.props.filterText;

        this.onChange = this.onChange.bind(this)
    }

    componentDidMount() {
        this.autorunDisposer = autorun(() => {
            transaction(() => {
                const data = this.data;
                setImmediate(() => {
                    this.props.onFilteredDataChanged(data);
                });
            });
        });
    }

    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.filteredSource.filterText = e.target.value
        this.props.onQueryChanged(e.target.value)
    }

    componentWillUnmount() {
        this.filteredSource.dispose();
        if (this.autorunDisposer) this.autorunDisposer();
        // this.autorunDisposer?.();
    }

    render() {
        return <div style={{ marginBottom: '.5rem', padding: '0', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
            {/* <AutoComplete placeholder='Quick Search' size='large'
                style={{ width: 'auto', padding: '0' }}
                onChange={v => this.filteredSource.filterText = String(v)}
                dataSource={['battle-logs', 'customer', 'asdfg', 'kafka', 'some word']}
            > */}
            <Input allowClear={true} placeholder='Quick Search' size='large' style={{ width: '350px' }}
                onChange={this.onChange}
                value={this.props.filterText}
            // addonAfter={
            //     <Popover trigger='click' placement='right' title='Search Settings' content={<this.Settings />}>
            //         <Icon type='setting' style={{ color: '#0006' }} />
            //     </Popover>
            // }
            />

            <this.FilterSummary />
        </div>
    }

    Settings = observer(() => {
        return <div>
            <Checkbox checked={true}>Column 1</Checkbox>
            <div style={{ height: 1, margin: '1em 0', background: '#0003' }} />
            <Checkbox>Case-Sensitive</Checkbox>
        </div>
    })

    FilterSummary = observer((() => {
        const searchSummary = this.computeFilterSummary();

        return (
            <AnimatePresence>
                {searchSummary &&
                    <MotionSpan
                        identityKey={searchSummary?.identity ?? 'null'} // identityKey={searchSummary?.identity ?? 'null'}
                        overrideAnimProps={animProps_span_searchResult}
                    >
                        <span style={{ opacity: 0.8, paddingLeft: '1em' }}>
                            {searchSummary?.node}
                        </span>
                    </MotionSpan>
                }
            </AnimatePresence>

        )
    }).bind(this));

    computeFilterSummary(): { identity: string, node: React.ReactNode } | null {
        const source = this.props.dataSource();
        if (!source || source.length == 0) {
            // console.log('filter summary:');
            // console.dir(source);
            // console.dir(this.filteredSource.filterText);
            return null;
        }

        if (!this.filteredSource.lastFilterText)
            return null;

        const sourceLength = source.length;
        const resultLength = this.filteredSource.data.length;

        if (sourceLength == resultLength)
            return { identity: 'all', node: <span>Filter matched everything</span> };

        return { identity: 'r', node: <span><span style={{ fontWeight: 600 }}>{this.filteredSource.data.length}</span> results</span> }
    }

}

export default SearchBar