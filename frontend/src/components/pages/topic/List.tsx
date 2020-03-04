import React, { Component, RefObject } from "react";
import { Table, Empty, Skeleton, Checkbox, Row, Statistic, Input, Typography, AutoComplete, Icon, Button, Popover, Switch, Divider } from "antd";
import { observer } from "mobx-react";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { PageComponent, PageInitHelper } from "../Page";
import { makePaginationConfig, sortField } from "../../misc/common";
import { motion } from "framer-motion";
import { animProps, MotionDiv, MotionSpan } from "../../../utils/animationProps";
import { appGlobal } from "../../../state/appGlobal";
import { FilterableDataSource } from "../../../utils/filterableDataSource";
import { TopicDetail } from "../../../state/restInterfaces";
import { observable, autorun, IReactionDisposer } from "mobx";
import prettyBytes from "pretty-bytes";
import { prettyBytesOrNA } from "../../../utils/utils";
import { uiState } from "../../../state/uiState";
import Card from "../../misc/Card";
import { editQuery } from "../../../utils/queryHelper";
const { Text } = Typography;
const statisticStyle: React.CSSProperties = { margin: 0, marginRight: '2em', padding: '.2em' };


@observer
class TopicList extends PageComponent {

    pageConfig = makePaginationConfig(uiSettings.topicList.pageSize);
    @observable searchBar: RefObject<SearchBar<TopicDetail>> = React.createRef();
    quickSearchReaction: IReactionDisposer;

    initPage(p: PageInitHelper): void {
        p.title = 'Topics';
        p.addBreadcrumb('Topics', '/topics');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    componentDidMount() {
        // 1. use 'q' parameter for quick search (if it exists)
        editQuery(query => {
            if (query["q"])
                uiSettings.topicList.quickSearch = String(query["q"]);
        });

        // 2. whenever the quick search box changes, update the url
        this.quickSearchReaction = autorun(() => {
            editQuery(query => {
                const q = String(uiSettings.topicList.quickSearch);
                query["q"] = q ? q : undefined;
            })
        });
    }
    componentWillUnmount() {
        if (this.quickSearchReaction) this.quickSearchReaction();
    }

    refreshData(force: boolean) {
        api.refreshTopics(force);
    }

    getTopics() {
        if (!api.Topics) return [];
        return api.Topics.filter(t => uiSettings.topicList.hideInternalTopics && t.isInternal ? false : true);
    }

    isFilterMatch(filter: string, item: TopicDetail): boolean {
        if (item.topicName.toLowerCase().includes(filter)) return true;
        return false;
    }

    render() {
        if (!api.Topics) return this.skeleton;
        if (api.Topics.length == 0) return <Empty />

        const topics = this.getTopics();

        const data = this.searchBar.current ? this.searchBar.current.data : ([] as TopicDetail[]);

        return (
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <Card>
                    <Row type="flex">
                        <Statistic title='Total Topics' value={topics.length} />
                        <Statistic title='Total Partitions' value={topics.map(x => x.partitionCount).reduce((p, c) => p + c)} />
                    </Row>
                </Card>

                <Card>
                    <SearchBar<TopicDetail> dataSource={this.getTopics} isFilterMatch={this.isFilterMatch} ref={this.searchBar} />

                    <Table
                        style={{ margin: '0', padding: '0' }} size='middle'
                        onRow={(record) =>
                            ({
                                onClick: () => appGlobal.history.push('/topics/' + record.topicName),
                            })}
                        onChange={x => { if (x.pageSize) { uiSettings.topicList.pageSize = x.pageSize; this.pageConfig.pageSize = x.pageSize; } }}
                        rowClassName={() => 'hoverLink'}
                        pagination={this.pageConfig}
                        dataSource={data}
                        rowKey={x => x.topicName}
                        columns={[
                            { title: 'Name', dataIndex: 'topicName', sorter: sortField('topicName'), className: 'whiteSpaceDefault' },
                            { title: 'Partitions', dataIndex: 'partitions', render: (t, r) => r.partitionCount, sorter: (a, b) => a.partitionCount - b.partitionCount, width: 1 },
                            { title: 'Replication', dataIndex: 'replicationFactor', width: 1 },
                            { title: 'CleanupPolicy', dataIndex: 'cleanupPolicy', width: 1 },
                            { title: 'Size', dataIndex: 'logDirSize', render: (t: number) => prettyBytesOrNA(t), sorter: (a, b) => a.logDirSize - b.logDirSize, width: '140px' },
                        ]} />
                </Card>
            </motion.div>
        );
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'} style={{ margin: '2rem' }}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}


// todo: extract out where the filterText is retreived from / saved.
//       this component was originally extracted out of another component, but we probably want to re-use it elsewhere in the future
@observer
class SearchBar<TItem> extends Component<{ dataSource: () => TItem[], isFilterMatch: (filter: string, item: TItem) => boolean }> {

    private filteredSource = {} as FilterableDataSource<TItem>;
    get data() { return this.filteredSource.data; }

    /*
        todo: autocomplete:
        - save as suggestion on focus lost, enter, or clear
        - only show entries with matching start
    */
    // todo: allow setting custom "rows" to search, and case sensitive or not (pass those along to isFilterMatch)

    constructor(p: any) {
        super(p);
        this.filteredSource = new FilterableDataSource<TItem>(this.props.dataSource, this.props.isFilterMatch);
        this.filteredSource.filterText = uiSettings.topicList.quickSearch;
    }

    componentWillUnmount() {
        this.filteredSource.dispose();
    }

    render() {
        return <div style={{ marginBottom: '.5rem', padding: '0', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
            {/* <AutoComplete placeholder='Quick Search' size='large'
                style={{ width: 'auto', padding: '0' }}
                onChange={v => this.filteredSource.filterText = String(v)}
                dataSource={['battle-logs', 'customer', 'asdfg', 'kafka', 'some word']}
            > */}
            <Input allowClear={true} placeholder='Quick Search' size='large' style={{ width: 'auto' }}
                onChange={e => this.filteredSource.filterText = uiSettings.topicList.quickSearch = e.target.value}
                value={uiSettings.topicList.quickSearch}
            // addonAfter={
            //     <Popover trigger='click' placement='right' title='Search Settings' content={<this.Settings />}>
            //         <Icon type='setting' style={{ color: '#0006' }} />
            //     </Popover>
            // }
            />
            {/* </AutoComplete> */}
            <this.FilterSummary />

            <span style={{ flex: 1 }} />
            <Checkbox
                style={{ marginLeft: '1rem' }}
                checked={uiSettings.topicList.hideInternalTopics}
                onChange={e => uiSettings.topicList.hideInternalTopics = e.target.checked}
            >Hide internal topics</Checkbox>
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

        const displayText = sourceLength == resultLength
            ? 'Filter matched everything'
            : <><b>{this.filteredSource.data.length}</b> results</>;

        return <MotionSpan identityKey={displayText} >
            <Text type='secondary' style={{ marginLeft: '1em' }} >{displayText}</Text>
        </MotionSpan>

    }).bind(this));

}


export default TopicList;
