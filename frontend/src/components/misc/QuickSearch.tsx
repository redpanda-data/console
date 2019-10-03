import { Component, ReactNode } from "react";
import { observer } from "mobx-react";
import React from "react";
import { Tooltip, Typography, Input } from "antd";
import { MotionDiv } from "../../utils/animationProps";
import { debounce } from "../../utils/utils";
import { observable } from "mobx";
const Text = Typography.Text;

@observer
export class QuickSearch extends Component<{ onChange: (text: string) => ReactNode }> {

    @observable quickFilter = '';
    @observable.shallow filterResult: ReactNode = null;
    debouncedCallback: (text: string) => void;

    constructor(p: Readonly<{ onChange: (text: string) => ReactNode; }>) {
        super(p);

        const self = this;
        const func = (t: string) => {
            var resultNode = self.props.onChange(t);
            if (!resultNode) resultNode = null;
            self.filterResult = resultNode;
        };
        this.debouncedCallback = debounce(func, 200);
    }

    render() {
        // todo: show result info (count) as a tooltip above the input;
        // and prevent the 'help' tooltip from appearing
        /*
        const quickSerach = <>
            <Tooltip placement='top' overlay={<><div>Search in: offset, key, value</div><div>(case-sensitive)</div></>}
                align={{ offset: [0, -5] }} mouseEnterDelay={0.5}
            >
                <Input style={{ marginRight: '1em', width: 'auto', padding: '0', whiteSpace: 'nowrap' }}
                    placeholder='Quick Search' allowClear={true} size='large'
                    value={this.quickFilter} onChange={e => this.setQuickFilter(e.target.value)}
                //addonAfter={this.QuickSearchSettings()}
                />
            </Tooltip>
        </>
        */

        return <>
            <Input placeholder='Quick Search' allowClear={true} size='large'
                style={{ marginRight: '1em', width: 'auto', padding: '0', whiteSpace: 'nowrap' }}
                value={this.quickFilter}
                onChange={e => this.setQuickFilter(e.target.value)}
            // addonAfter={this.QuickSearchSettings()}
            />
            <this.FilterResult />
        </>
    }

    FilterResult = observer(() => {
        return <>{this.filterResult}</>
    })

    setQuickFilter(str: string) {
        this.quickFilter = str;
        this.debouncedCallback(str);
    }
}


@observer
export class QuickSearch2<T> extends Component<{ data: T[] | undefined, isMatch: (f: string, item: T) => boolean, setResult: (filteredData: T[]) => void, delay?: number }> {
    emptyAr: [];
    @observable quickFilter = '';
    @observable.shallow filterResult: ReactNode = null;

    constructor(p: any) {
        super(p);
    }

    render() {
        return <>
            <Input placeholder='Quick Search' allowClear={true} size='large'
                style={{ marginRight: '1em', width: 'auto', padding: '0', whiteSpace: 'nowrap' }}
                value={this.quickFilter}
                onChange={e => this.onChange(e.target.value)}
            />
            <this.FilterResult />
        </>
    }

    onChange(str: string) {
        this.quickFilter = str;
        this.updateFilter(str);
    }

    updateFilter = debounce(((str: string) => {
        this.quickFilter = str;

        if (!this.props.data || this.props.data.length == 0) {
            this.props.setResult(this.props.data || []);
            return;
        }

        const filtered = this.props.data.filter(item => this.props.isMatch(str, item));
        this.props.setResult(filtered);
    }).bind(this), this.props.delay || 100);


    FilterResult = observer(() => {
        return <>{this.filterResult}</>
    })

}