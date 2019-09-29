import { Component } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage } from "../../models/ServiceModels";
import { Table, Tooltip, Icon, Row, Statistic, Tabs, Descriptions, Popover, Skeleton, Radio, Checkbox, Button, Switch, Select, Input, Form, Divider, Typography, message } from "antd";
import { observer } from "mobx-react";
import { api, TopicMessageOffset, TopicMessageSortBy, TopicMessageDirection, TopicMessageSearchParameters } from "../../state/backendApi";
import { uiState as ui } from "../../state/ui";
import ReactJson from 'react-json-view'
import { PageComponent, PageInitHelper } from "./Page";
import prettyMilliseconds from 'pretty-ms';
import prettyBytes from 'pretty-bytes';
import topicConfigInfo from '../../assets/topicConfigInfo.json'
import { sortField, cullText, range, makePaginationConfig } from "../common";
import { motion } from "framer-motion";
import { observable } from "mobx";
import { debounce } from "../../utils/utils";
import { FormComponentProps } from "antd/lib/form";
import { animProps, MotionAlways, MotionDiv } from "../../utils/animationProps";
import Paragraph from "antd/lib/typography/Paragraph";

const { Text } = Typography;

const { Option } = Select;
const InputGroup = Input.Group;


@observer
class TopicDetails extends PageComponent<{ topicName: string }> {

    initPage(p: PageInitHelper): void {
        const topicName = this.props.topicName;
        ui.currentTopicName = topicName;
        api.clearMessageCache();
        api.refreshTopics();
        api.refreshTopicConfig(topicName);


        p.title = topicName;
        p.addBreadcrumb('Topics', '/topics');
        p.addBreadcrumb(topicName, '/topics/' + topicName);
    }

    render() {

        // todo: use 'replicaAssignments': "This topic is replicating partitions 1,3,5 to broker Kafka5, and 2,4,6 to Kafka25"
        const topicName = this.props.topicName;

        if (!api.Topics) return skeleton;
        const topic = api.Topics.find(e => e.topicName == topicName);
        if (!topic) return skeleton;
        const topicConfig = api.TopicConfig.get(topicName);
        if (!topicConfig) return skeleton;

        return (
            <motion.div {...animProps} key={'b'}>
                {/* QuickInfo */}
                <TopicQuickInfoStatistic config={topicConfig} />

                {/* Tabs:  Messages, Configuration */}
                <Tabs style={{ overflow: 'visible' }} animated={false}
                    activeKey={ui.topicDetails.activeTabKey || '1'}
                    onChange={e => ui.topicDetails.activeTabKey = e}
                >
                    <Tabs.TabPane key="1" tab="Messages">
                        <TopicMessageView topic={topic} />
                    </Tabs.TabPane>

                    <Tabs.TabPane key="2" tab="Configuration">
                        <ConfigDisplaySettings />
                        <TopicConfiguration config={topicConfig} />
                    </Tabs.TabPane>
                </Tabs>
            </motion.div>
        );
    }

}

const skeleton = <>
    <motion.div {...animProps} key={'loader'}>
        <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
    </motion.div>
</>

const TopicQuickInfoStatistic = observer((p: { config: TopicConfigEntry[] }) =>
    <Row type="flex" style={{ marginBottom: '1em' }}>
        {p.config.filter(e => ui.topicDetails.favConfigEntries.includes(e.name)).map((e) =>
            FavoritePopover(e, (
                <div style={{ margin: 0, marginRight: '2em', padding: '.2em' }}>
                    <Statistic title={(e.name)} value={FormatValue(e)} />
                </div>
            ))
        )
        }
    </Row>
)



@observer
class TopicMessageView extends Component<{ topic: TopicDetail }> {

    @observable requestInProgress = false;
    @observable quickFilter = '';
    @observable messages: TopicMessage[];
    @observable searchParams: TopicMessageSearchParameters = {
        _offsetMode: TopicMessageOffset.End,
        startOffset: -1, partitionID: 0, pageSize: 50,
        sortOrder: TopicMessageDirection.Descending, sortType: TopicMessageSortBy.Offset
    };

    constructor(props: { topic: TopicDetail }) {
        super(props);
        this.executeMessageSearch = this.executeMessageSearch.bind(this); // needed because we must pass the function directly as 'submit' prop
    }

    componentDidMount() {
        this.executeMessageSearch(new InnerSearchParametersForm(null as any));
    }

    render() {
        const topic = this.props.topic;
        const SearchForm = Form.create<SearchParametersProps>({ name: 'messageSearch' })(InnerSearchParametersForm);

        return <>
            {/* Message Search */}
            <SearchForm topic={topic} submit={this.executeMessageSearch} searchParams={this.searchParams} requestInProgress={this.requestInProgress} />

            {/* Quick Search Line */}
            <Row align='middle' style={{ marginBottom: '1em', display: 'flex', alignItems: 'center' }} > {/* Quick Search  -  Json Preview Settings */}

                <Tooltip
                    placement='top'
                    overlay={<>
                        <div>Search in: offset, key, value</div>
                        <div>(case-sensitive)</div>
                    </>}
                    align={{ offset: [0, -5] }} mouseEnterDelay={0.5}
                >
                    <Input style={{ marginRight: '1em', width: 'auto', padding: '0', whiteSpace: 'nowrap' }}
                        placeholder='Quick Search' allowClear={true} size='large'
                        value={this.quickFilter} onChange={e => this.setQuickFilter(e.target.value)}
                    //addonAfter={this.QuickSearchSettings()}
                    />

                </Tooltip>

                <this.quickSearchResultInfo />

                <this.searchQueryAdditionalInfo />
            </Row>

            {/* Message Table */}
            <this.renderMessageTable />
        </>
    }

    renderMessageTable = observer(() => {
        const pageConfig = makePaginationConfig();
        return <Table
            style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }}
            bordered={true} size='small'
            pagination={pageConfig}
            dataSource={this.messages}
            loading={this.requestInProgress}
            rowKey={r => r.offset + ' ' + r.partitionID + r.timestamp}

            expandRowByClick={false}
            expandedRowRender={record => RenderExpandedMessage(record.valueObject)}
            expandIconAsCell={false}
            expandIconColumnIndex={4}
            columns={[
                { width: 1, title: 'Offset', dataIndex: 'offset', sorter: sortField('offset'), defaultSortOrder:'descend' },
                { width: 1, title: 'Timestamp', dataIndex: 'timestamp', sorter: sortField('timestamp'), render: (t: number) => new Date(t * 1000).toLocaleString() },
                { width: 1, title: 'Partition', dataIndex: 'partitionID', sorter: sortField('partitionID'), },
                { width: 1, title: 'Key', dataIndex: 'key', render: (t) => t },
                {
                    title: 'Value (Preview)',
                    dataIndex: 'value',
                    render: (t, r) => RenderPreview(r.valueObject),
                },
                {
                    width: 1,
                    title: 'Action',
                    key: 'action',
                    render: (text, record) => (
                        <span>
                            <Button type='link' size='small' onClick={() => this.copyMessage(record)}>Copy</Button>
                            {/* <Divider type="vertical" /> */}
                        </span>
                    ),
                },
            ]} />
    })

    copyMessage(record: TopicMessage) {
        navigator.clipboard.writeText(record.valueJson);
        message.success('Message content (JSON) copied to clipboard', 5);
    }

    QuickSearchSettings(): React.ReactNode {
        const content = <>
            <div>Placeholder 1 <Switch size='small' /></div>
            <div>Placeholder 2 <Switch size='small' /></div>
            <div>Placeholder 3 <Switch size='small' /></div>
        </>
        return <Popover title='Quick Search' content={content} trigger='click'><Icon type='setting' /></Popover>
    }

    quickSearchResultInfo = observer(() => {
        if (!this.quickFilter || this.quickFilter.length == 0 || !this.messages)
            return null;

        const displayText = this.messages.length == api.Messages.length
            ? 'Filter matched all messages'
            : <><b>{this.messages.length}</b> results</>;

        return <MotionDiv identityKey={displayText}>
            <Divider type='vertical' />
            <Text type='secondary'>{displayText}</Text>
        </MotionDiv>
    })

    searchQueryAdditionalInfo = observer(() => {
        if (!api.MessageResponse) return null;
        if (api.MessageResponse.fetchedMessages === undefined) return null;
        const formatTime = (ms: number) => !!ms && ms > 0
            ? prettyMilliseconds(api.MessageResponse.elapsedMs, { secondsDecimalDigits: 2 })
            : "undefined";

        const warningDisplay = () => <>
            <Icon type="warning" theme="twoTone" twoToneColor="orange" style={{ fontSize: '150%', marginRight: '0.2em' }} />
            <Text type='warning' strong>
                Backend aborted the search after <b>{formatTime(api.MessageResponse.elapsedMs)}</b> (fetched {api.MessageResponse.fetchedMessages} messages)
            </Text>
        </>

        const normalDisplay = () => <>
            <Text type='secondary'>
                <b>{api.MessageResponse.fetchedMessages}</b> messages in <b>{formatTime(api.MessageResponse.elapsedMs)}</b>
            </Text>
        </>

        return <MotionAlways>
            <span style={{ display: 'flex', alignItems: 'center' }}>
                <Divider type='vertical' />
                {api.MessageResponse.isCancelled === true ? warningDisplay() : normalDisplay()}
            </span>
        </MotionAlways>
    })

    setQuickFilter(str: string) {
        this.quickFilter = str;
        this.updateQuickFilterDebounced();
    }

    updateQuickFilterDebounced = debounce(this.updateQuickFilter, 200);
    updateQuickFilter() {
        if (!this.messages) return;

        const str = this.quickFilter;
        if (str && str.length > 0)
            this.messages = api.Messages.filter(m => {
                if (m.offset.toString().includes(str)) { return true; }
                if (m.key && m.key.includes(str)) { return true; }
                if (m.valueJson && m.valueJson.includes(str)) { return true; }
                return false;
            });
        else
            this.messages = api.Messages;
    }



    async executeMessageSearch(form: InnerSearchParametersForm): Promise<void> {
        const searchParams = this.searchParams;

        if (searchParams._offsetMode != TopicMessageOffset.Custom)
            searchParams.startOffset = searchParams._offsetMode;

        try {
            this.requestInProgress = true;
            await api.searchTopicMessages(this.props.topic.topicName, searchParams);
            this.messages = api.Messages;
        } catch (error) {
            console.error('error in searchTopicMessages: ' + error.toString());
            this.messages = undefined as any;
        } finally {
            this.requestInProgress = false;
        }
    }
}



interface SearchParametersProps extends FormComponentProps {
    searchParams: TopicMessageSearchParameters;
    topic: TopicDetail;
    submit: (form: InnerSearchParametersForm) => void;
    requestInProgress: boolean;
}

@observer
class InnerSearchParametersForm extends Component<SearchParametersProps> {
    render() {
        const topic = this.props.topic;
        const searchParams = this.props.searchParams;
        const submit = this.props.submit;
        return (
            <Form layout='inline' colon={false} className='query-form' onSubmit={this.handleSubmit}>

                <Row>
                    {/* Offset */}
                    <Form.Item>
                        <InputGroup compact>
                            <Select<TopicMessageOffset> value={searchParams._offsetMode} onChange={e => searchParams._offsetMode = e}
                                dropdownMatchSelectWidth={false} style={{ width: '10em' }}>
                                <Option value={TopicMessageOffset.Custom}>Custom Offset</Option>
                                <Option value={TopicMessageOffset.Start}>Oldest Offset</Option>
                                <Option value={TopicMessageOffset.End}>Newest Offset</Option>
                            </Select>
                            <Input style={{ width: '8em' }} maxLength={20}
                                value={searchParams.startOffset} onChange={e => searchParams.startOffset = +e.target.value}
                                disabled={searchParams._offsetMode != TopicMessageOffset.Custom} />
                        </InputGroup>
                    </Form.Item>

                    {/* specific offset: lock partition to 'not all' */}
                    <Form.Item>
                        <Select<number> value={searchParams.partitionID} onChange={c => searchParams.partitionID = c} style={{ width: '9em' }}>
                            <Select.Option key='all' value={-1}>All Partitions</Select.Option>
                            {range(0, topic.partitionCount).map(i =>
                                <Select.Option key={i} value={i}>Partition {i.toString()}</Select.Option>)}
                        </Select>
                    </Form.Item>

                    <Form.Item>
                        <Select<number> value={searchParams.pageSize} onChange={c => searchParams.pageSize = c} style={{ width: '10em' }}>
                            {[1, 3, 5, 10, 20, 50, 100, 200, 500].map(i => <Select.Option key={i} value={i}>{i.toString()} results</Select.Option>)}
                        </Select>
                    </Form.Item>

                    {/* Timestamp/Offset */}
                    {/* <Form.Item>
                        <Radio.Group onChange={e => this.sortType = e.target.value} value={this.sortType}>
                            <Radio.Button value={TopicMessageSortBy.Offset}>Sort By Offset</Radio.Button>
                            <Radio.Button value={TopicMessageSortBy.Timestamp}>Sort By Timestamp</Radio.Button>
                        </Radio.Group>
                    </Form.Item> */}

                    {/* Asc/Desc */}
                    {/* <Form.Item>
                        <Radio.Group onChange={e => this.sortOrder = e.target.value} value={this.sortOrder}>
                            <Radio.Button value={TopicMessageDirection.Ascending}>Ascending</Radio.Button>
                            <Radio.Button value={TopicMessageDirection.Descending}>Descending</Radio.Button>
                        </Radio.Group>
                    </Form.Item> */}

                    <Form.Item>
                        <Button type='primary' icon='search' loading={this.props.requestInProgress} onClick={() => submit(this)} >Search</Button>
                    </Form.Item>
                </Row>

            </Form>
        );
    }

    handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        this.props.form.validateFields((err, values) => {
            if (!err) {
                console.log('Received values of form: ', values);
            } else {
                this.props.submit(this);
            }
        });
    };
}


function RenderPreview(obj: any) {
    try {
        if (!obj) return <code>null</code>

        const text = cullText(JSON.stringify(obj), 100);
        return (
            <span className='cellDiv'>{text}</span>
        )
    }
    catch (e) {
        return <span style={{ color: 'red' }}>Error in RenderPreview: {e.toString()}</span>
    }
}

function RenderExpandedMessage(obj: any) {
    try {
        if (!obj) return <code>null</code>

        return (
            <>
                {/* <Affix offsetTop={30}>
                    <Button icon='copy' shape='circle' size='large'
                        style={{ float: 'right', margin: '1em', zIndex: 10 }} />
                </Affix> */}

                <ReactJson
                    src={obj}
                    name={null}
                    collapseStringsAfterLength={40}
                    displayDataTypes={false} displayObjectSize={true} enableClipboard={false}
                    collapsed={3}
                    groupArraysAfterLength={100}
                    indentWidth={6}
                    iconStyle='triangle'
                    style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}
                />
            </>
        )
    }
    catch (e) {
        return <span style={{ color: 'red' }}>Error in RenderExpandedMessage: {e.toString()}</span>
    }
}



const ConfigDisplaySettings = observer(() =>
    <div style={{ marginTop: '1em', marginBottom: '1em' }}>

        <Row>
            <Radio.Group value={ui.topicDetails.valueDisplay} onChange={(e) => ui.topicDetails.valueDisplay = e.target.value} size='small'>
                <Radio.Button value="friendly">Friendly</Radio.Button>
                <Radio.Button value="raw">Raw</Radio.Button>
                {/* <Radio.Button value="both">Both</Radio.Button> */}
            </Radio.Group>

            <span> </span>

            <Checkbox onChange={(e) => ui.topicDetails.onlyShowChanged = e.target.checked} checked={ui.topicDetails.onlyShowChanged}>Only show changed</Checkbox>

        </Row>
    </div>);


// Full topic configuration
const TopicConfiguration = observer((p: { config: TopicConfigEntry[] }) =>
    <Descriptions bordered size='small' colon={true} layout='horizontal' column={1} style={{ display: 'inline-block' }}>
        {
            p.config.filter(e => ui.topicDetails.onlyShowChanged ? !e.isDefault : true).map((e) =>
                <Descriptions.Item key={e.name} label={DataName(e)} >{DataValue(e)}</Descriptions.Item>
            )
        }
    </Descriptions>
)

const FavoritePopover = (configEntry: TopicConfigEntry, children: React.ReactNode) => {

    const name = configEntry.name;

    const isFav = ui.topicDetails.favConfigEntries.includes(name);
    const toggleFav = isFav
        ? () => ui.topicDetails.favConfigEntries.splice(ui.topicDetails.favConfigEntries.indexOf(name), 1)
        : () => ui.topicDetails.favConfigEntries.push(name);

    const infoEntry = topicConfigInfo.find(e => e.Name == name);

    const popupContent = <div>
        <Paragraph style={{ maxWidth: '400px' }}>
            <b>Description</b><br />
            <Text>{infoEntry ? infoEntry.Description : "Config property '" + name + "' unknown"}</Text>
        </Paragraph>

        <Checkbox
            children="Show this setting in 'Quick Info'"
            checked={isFav}
            onChange={() => toggleFav()}
        />

    </div>

    return (
        <Popover key={configEntry.name} placement='right' trigger='click' title={<>Config <Text code>{name}</Text></>} content={popupContent}>
            <div className='hoverLink' style={{ display: 'flex', verticalAlign: 'middle', cursor: 'pointer' }}>
                {children}
                {/* <div style={{ flexGrow: 1 }} /> */}
            </div>
        </Popover>
    )
}

function DataName(configEntry: TopicConfigEntry) {
    return FavoritePopover(configEntry, configEntry.name);
}

function DataValue(configEntry: TopicConfigEntry) {
    const value = FormatValue(configEntry);

    if (configEntry.isDefault) {
        return <code>{value}</code>
    }

    return (
        <Tooltip title="Value is different from the default">
            {markerIcon}
            <code>{value}</code>
        </Tooltip>
    )
}

function FormatValue(configEntry: TopicConfigEntry): string {
    const value = configEntry.value;
    let suffix: string;

    switch (ui.topicDetails.valueDisplay) {
        case 'friendly': suffix = ''; break;
        case 'both': suffix = ' (' + value + ')'; break;

        case 'raw':
        default:
            return configEntry.value;
    }

    const num = Number(value);


    // Special cases for known configuration entries
    if (configEntry.name == 'flush.messages' && num > Math.pow(2, 60))
        return 'Never' + suffix;

    // Don't modify zero at all
    if (value === '0')
        return value;

    // Time
    if (configEntry.name.endsWith('.ms')) {
        // More than 100 years -> Infinite
        if (num > 3155695200000) return 'Infinite' + suffix;
        // Convert into a readable format
        return prettyMilliseconds(num, { verbose: true, }) + suffix;
    }

    // Bytes
    if (configEntry.name.endsWith('.bytes')) {
        return prettyBytes(num) + suffix;
    }

    return value;
}

const markerIcon = <Icon type="highlight" theme="twoTone" twoToneColor="#1890ff" style={{ fontSize: '1.5em', marginRight: '.25em' }} />



export default TopicDetails;
