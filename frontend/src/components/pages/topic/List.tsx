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
import { observable } from "mobx";
import prettyBytes from "pretty-bytes";
import { prettyBytesOrNA } from "../../../utils/utils";
const { Text } = Typography;
const statisticStyle: React.CSSProperties = { margin: 0, marginRight: '2em', padding: '.2em' };


@observer
class TopicList extends PageComponent {

    pageConfig = makePaginationConfig(uiSettings.topicList.pageSize);
    @observable searchBar: RefObject<SearchBar<TopicDetail>> = React.createRef();

    initPage(p: PageInitHelper): void {
        p.title = 'Topics';
        p.addBreadcrumb('Topics', '/topics');
        p.extraContent = () => <>
            <Checkbox
                checked={uiSettings.topicList.hideInternalTopics}
                onChange={e => uiSettings.topicList.hideInternalTopics = e.target.checked}
            >Hide internal topics</Checkbox>
        </>

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
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
            <motion.div {...animProps}>
                <Row type="flex" style={{ marginBottom: '1em' }}>
                    <Statistic title='Total Topics' value={topics.length} style={statisticStyle} />
                    <Statistic title='Total Partitions' value={topics.map(x => x.partitionCount).reduce((p, c) => p + c)} style={statisticStyle} />
                </Row>

                <SearchBar<TopicDetail> dataSource={this.getTopics} isFilterMatch={this.isFilterMatch} ref={this.searchBar} />

                <Table
                    style={{ margin: '0', padding: '0' }} bordered={true} size='middle'
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
            </motion.div>
        );
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}


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
        return <div style={{ marginBottom: '1em', padding: '0', whiteSpace: 'nowrap' }}>
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
