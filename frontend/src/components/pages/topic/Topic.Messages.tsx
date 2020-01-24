import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage } from "../../../state/restInterfaces";
import { Table, Tooltip, Icon, Row, Statistic, Tabs, Descriptions, Popover, Skeleton, Radio, Checkbox, Button, Select, Input, Form, Divider, Typography, message, Tag, Alert, Empty, ConfigProvider, Modal, AutoComplete } from "antd";
import { observer } from "mobx-react";
import { api, TopicMessageOffset, TopicMessageSortBy, TopicMessageDirection, TopicMessageSearchParameters } from "../../../state/backendApi";
import { uiSettings, PreviewTag } from "../../../state/ui";
import ReactJson, { CollapsedFieldProps } from 'react-json-view'
import { PageComponent, PageInitHelper } from "../Page";
import prettyMilliseconds from 'pretty-ms';
import prettyBytes from 'pretty-bytes';
import { sortField, range, makePaginationConfig, Spacer } from "../../misc/common";
import { motion, AnimatePresence } from "framer-motion";
import { observable, computed, transaction } from "mobx";
import { findElementDeep, cullText, getAllKeys } from "../../../utils/utils";
import { FormComponentProps } from "antd/lib/form";
import { animProps, MotionAlways, MotionDiv } from "../../../utils/animationProps";
import Paragraph from "antd/lib/typography/Paragraph";
import { ColumnProps } from "antd/lib/table";
import '../../../utils/arrayExtensions';
import { FilterableDataSource } from "../../../utils/filterableDataSource";
import { ModalFunc } from "antd/lib/modal/Modal";
import { uiState } from "../../../state/uiState";

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;



@observer
export class TopicMessageView extends Component<{ topic: TopicDetail }> {

    @observable requestInProgress = false;
    @observable searchParams: TopicMessageSearchParameters = {
        _offsetMode: TopicMessageOffset.End,
        startOffset: -1, partitionID: -1, pageSize: 50,
        sortOrder: TopicMessageDirection.Descending, sortType: TopicMessageSortBy.Offset
    };
    @observable previewDisplay: string[] = [];
    @observable allCurrentKeys: string[] = [];
    @observable showPreviewSettings = false;

    @observable fetchError = null as Error | null;

    pageConfig = makePaginationConfig(uiState.topicSettings.pageSize);
    messageSource = new FilterableDataSource<TopicMessage>(() => api.Messages, this.isFilterMatch);

    constructor(props: { topic: TopicDetail }) {
        super(props);
        this.executeMessageSearch = this.executeMessageSearch.bind(this); // needed because we must pass the function directly as 'submit' prop
        this.messageSource.filterText = uiState.topicSettings.quickSearch;
    }

    componentDidMount() {
        this.executeMessageSearch();
    }
    componentWillUnmount() {
        this.messageSource.dispose();
    }

    render() {
        const topic = this.props.topic;
        const SearchForm = Form.create<SearchParametersProps>({ name: 'messageSearch' })(InnerSearchParametersForm);

        return <>
            {/* Message Search */}
            <SearchForm topic={topic} submit={this.executeMessageSearch} searchParams={this.searchParams} requestInProgress={this.requestInProgress} />

            {this.fetchError
                ? <Alert
                    type="error" showIcon
                    message="Backend API Error"
                    description={<div>
                        <Text>Please check and modify the request before resubmitting.</Text>
                        <div className='codeBox'>{this.fetchError.message}</div>
                    </div>}
                />
                : <>
                    {/* Quick Search Line */}
                    <Row align='middle' style={{ marginBottom: '1em', display: 'flex', alignItems: 'center' }} >

                        <Input placeholder='Quick Search' allowClear={true} size='large'
                            style={{ marginRight: '1em', width: 'auto', padding: '0', whiteSpace: 'nowrap' }}
                            value={uiState.topicSettings.quickSearch}
                            onChange={e => uiState.topicSettings.quickSearch = this.messageSource.filterText = e.target.value}
                            addonAfter={null}
                        />
                        <this.FilterSummary />

                        <Spacer />
                        <this.SearchQueryAdditionalInfo />
                    </Row>

                    <this.MessageTable />
                </>
            }
        </>
    }

    isFilterMatch(str: string, m: TopicMessage) {
        str = str.toLowerCase();
        if (m.offset.toString().toLowerCase().includes(str)) return true;
        if (m.key && m.key.toLowerCase().includes(str)) return true;
        if (m.valueJson && m.valueJson.toLowerCase().includes(str)) return true;
        return false;
    }

    FilterSummary() {

        if (this && this.messageSource && this.messageSource.data) {
            // todo
        }
        else {
            return null;
        }

        const displayText = this.messageSource.data.length == api.Messages.length
            ? 'Filter matched all messages'
            : <><b>{this.messageSource.data.length}</b> results</>;

        return <div style={{ marginRight: '1em' }}>
            <MotionDiv identityKey={displayText}>
                <Text type='secondary'>{displayText}</Text>
            </MotionDiv>
        </div>
    }


    @computed
    get activeTags() {
        return uiState.topicSettings.previewTags.filter(t => t.active).map(t => t.value);
    }

    MessageTable = observer(() => {

        const valueTitle = <>
            <span>Value
                <span style={{ display: 'inline-flex', alignItems: 'center', height: 0, marginLeft: '4px' }}>
                    <Button shape='round' className='hoverBorder' onClick={() => this.showPreviewSettings = true} style={{ color: '#1890ff', padding: '0 0.5em' }}>
                        <Icon type='setting' style={{ fontSize: '1rem', transform: 'translateY(1px)' }} />
                        <span style={{ marginLeft: '.3em' }}>Preview</span>
                        {(() => {
                            const count = uiState.topicSettings.previewTags.sum(t => t.active ? 1 : 0);
                            if (count > 0)
                                return <span style={{ marginLeft: '.3em' }}>(<b>{count} active</b>)</span>
                            return <></>;
                        })()}
                    </Button>
                </span>
            </span>
        </>

        const columns: ColumnProps<TopicMessage>[] = [
            { width: 1, title: 'Offset', dataIndex: 'offset', sorter: sortField('offset'), defaultSortOrder: 'descend' },
            { width: 1, title: 'Timestamp', dataIndex: 'timestamp', sorter: sortField('timestamp'), render: (t: number) => new Date(t * 1000).toLocaleString() },
            { width: 1, title: 'Partition', dataIndex: 'partitionID', sorter: sortField('partitionID'), },
            { width: 1, title: 'Key', dataIndex: 'key', render: (t) => t },
            {
                title: valueTitle,
                dataIndex: 'value',
                render: (t, r) => <MessagePreview msg={r} previewFields={() => this.activeTags} />,
                //filteredValue: ['?'],
                //onFilter: (value, record) => { console.log(`Filtering value: ${value}`); return true; },
            },
            { width: 1, title: 'Size (≈)', dataIndex: 'size', align: 'right', render: (s) => { if (s > 1000) s = Math.round(s / 1000) * 1000; return prettyBytes(s) } },
            {
                width: 1, title: 'Action', key: 'action',
                render: (text, record) => !record.isValueNull && (
                    <span>
                        <Button type='link' size='small' onClick={() => this.copyMessage(record)}>Copy</Button>
                        {/* <Divider type="vertical" /> */}
                    </span>
                ),
            },
        ];

        return <>
            <ConfigProvider renderEmpty={this.empty}>
                <Table
                    style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }}
                    bordered={true} size='small'
                    pagination={this.pageConfig}
                    onChange={(pagination, filters, sorter, extra) => {
                        if (pagination.pageSize) uiState.topicSettings.pageSize = pagination.pageSize;
                        this.pageConfig.current = pagination.current;
                        this.pageConfig.pageSize = pagination.pageSize;
                    }}
                    dataSource={this.messageSource.data}
                    loading={this.requestInProgress}
                    rowKey={r => r.offset + ' ' + r.partitionID + r.timestamp}
                    rowClassName={(r: TopicMessage) => (r.isValueNull) ? 'tombstone' : ''}

                    expandRowByClick={false}
                    expandedRowRender={record => RenderExpandedMessage(record)}
                    expandIconAsCell={false}
                    expandIconColumnIndex={columns.findIndex(c => c.dataIndex === 'value')}
                    columns={columns}
                />

                {(this.messageSource.data && this.messageSource.data.length > 0) && <this.PreviewSettings />}
            </ConfigProvider>
        </>
    })

    copyMessage(record: TopicMessage) {
        navigator.clipboard.writeText(record.valueJson);
        message.success('Message content (JSON) copied to clipboard', 5);
    }

    previewSettingsModal: (ReturnType<ModalFunc> | null) = null;

    PreviewSettings = observer(() => {

        const content = <>
            <Paragraph>
                <Text>
                    When viewing large messages we're often only interested in a few specific fields.
                    To make the preview more helpful, add all the json keys you want to see.<br />
                    Click on an existing tag to toggle it on/off, or <b>x</b> to remove it.<br />
                </Text>
            </Paragraph>
            <div style={{ padding: '1.5em 1em', background: 'rgba(200, 205, 210, 0.16)', borderRadius: '4px' }}>
                <CustomTagList tags={uiState.topicSettings.previewTags} allCurrentKeys={this.allCurrentKeys} />
            </div>
            <div style={{ marginTop: '1em' }}>
                <h3 style={{ marginBottom: '0.5em' }}>Settings</h3>
                <Checkbox
                    checked={uiState.topicSettings.previewTagsCaseSensitive}
                    onChange={e => uiState.topicSettings.previewTagsCaseSensitive = e.target.checked}
                >Case Sensitive</Checkbox>
                {/* todo:

                    - Show Empty Messages: when unchecked, and the field-filters don't find anything, the whole message will be hidden instead of showing an empty "{}"
                    - JS filters! You get a small textbox where you can type in something like those examples:
                        Example 1 | // the bool result is simply interpreted as "show field?", pretty much like what we already have
                                  | return prop.key == 'name'

                        Example 2 | // instead of a simple bool, the result could also be 'HIDE', or 'COLLECT', ...
                                  | // 'HIDE' would simply filter the whole messages (skipping all further fields)
                                  | // 'COLLECT' would collects the property and continues searching the object, in case there are additional matches
                                  | if (prop.key == 'score' && prop.value < 5) return 'HIDE';

                    - JS filters could also be submitted to the backend, so it can do the filtering there already
                 */}
                {/* <Checkbox
                    checked={uiSettings.topicList.previewShowEmptyMessages}
                    onChange={e => uiSettings.topicList.previewShowEmptyMessages = e.target.checked}
                >Show Empty Messages</Checkbox> */}
            </div>
        </>

        return <Modal
            title={<span><Icon type="filter" style={{ fontSize: '22px', verticalAlign: 'bottom', marginRight: '16px', color: 'hsla(209, 20%, 35%, 1)' }} />Preview Fields</span>}
            visible={this.showPreviewSettings}
            onOk={() => this.showPreviewSettings = false}
            width={750}
            okText='Close'
            cancelButtonProps={{ style: { display: 'none' } }}
            closable={false}
            maskClosable={true}
        >
            {content}
        </Modal>;
    });


    async executeMessageSearch(): Promise<void> {
        const searchParams = this.searchParams;

        if (searchParams._offsetMode != TopicMessageOffset.Custom)
            searchParams.startOffset = searchParams._offsetMode;

        transaction(async () => {
            try {
                this.fetchError = null;
                this.requestInProgress = true;
                await api.searchTopicMessages(this.props.topic.topicName, searchParams);
                this.allCurrentKeys = Array.from(getAllKeys(api.Messages.map(m => m.value))); // cache array of every single key
                this.pageConfig.current = undefined;
            } catch (error) {
                console.error('error in searchTopicMessages: ' + error.toString());
                this.fetchError = error;
            } finally {
                this.requestInProgress = false;
            }
        });

    }

    SearchQueryAdditionalInfo = observer(() => {
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

        const typeTags = api.MessageResponse.messages.map(m => m.valueType).distinct().map(t => this.formatTypeToTag(t)).filter(t => t != null);

        const normalDisplay = () => <>
            <Text type='secondary'>
                <b>{api.MessageResponse.fetchedMessages}</b> messages (in <b>{formatTime(api.MessageResponse.elapsedMs)}</b>)
            </Text>
            <Divider type='vertical' />
            {typeTags}
        </>

        return <MotionAlways>
            <span style={{ display: 'flex', alignItems: 'center' }}>
                <Divider type='vertical' />
                {api.MessageResponse.isCancelled === true ? warningDisplay() : normalDisplay()}
            </span>
        </MotionAlways>
    })

    formatTypeToTag(type: string) {
        type = String(type);
        switch (type) {
            case 'json': return <Tag key={1} color='orange'>JSON</Tag>
            case 'xml': return <Tag key={2} color='green'>XML</Tag>
            case 'avro': return <Tag key={3} color='blue'>Avro</Tag>
            case 'binary': return <Tag key={4} color='red'>Binary</Tag>
            case 'text': return <Tag key={5} color='gold'>Text</Tag>
            case '': return null;
        }
        return <Tag key={6} color='black'>Unknown: {type}</Tag>
    }

    empty = () => <Empty description={<>
        <Text type='secondary' strong style={{ fontSize: '125%' }}>No messages</Text>
        <br />
        <span>Either the selected topic/partition did not contain any messages</span>
    </>} />
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


@observer
class MessagePreview extends Component<{ msg: TopicMessage, previewFields: () => string[] }> {
    render() {
        const msg = this.props.msg;
        const value = msg.value;
        const fields = this.props.previewFields();

        try {
            let text: ReactNode = <></>;

            if (!value || msg.isValueNull) {
                // null: must be a tombstone (maybe? what if other fields are not null?)
                // todo: render tombstones in a better way!
                text = <><Icon type='delete' style={{ fontSize: 16, color: 'rgba(0,0,0, 0.35)', verticalAlign: 'text-bottom', marginRight: '4px', marginLeft: '1px' }} /><code>Tombstone</code></>
            }
            else if (msg.valueType == 'text') {
                // Raw Text (wtf :P)
                text = value;
            }
            else if (msg.valueType == 'binary') {
                // Binary data is displayed as hex dump
                text = msg.valueBinHexPreview;
            }
            else if (fields.length > 0) {
                // Json!
                // Construct our preview object
                const previewObj: any = {};
                for (let f of fields) {
                    var x = findElementDeep(value, f, uiState.topicSettings.previewTagsCaseSensitive);
                    if (x !== undefined) {
                        previewObj[f] = x;
                    }
                }
                text = cullText(JSON.stringify(previewObj), 100);
            }
            else {
                // Normal display (json, no filters). Just stringify the whole object
                text = cullText(JSON.stringify(value), 100);
            }

            return <code><span className='cellDiv' style={{ fontSize: '85%' }}>{text}</span></code>
        }
        catch (e) {
            return <span style={{ color: 'red' }}>Error in RenderPreview: {e.toString()}</span>
        }
    }
}


function RenderExpandedMessage(msg: TopicMessage, shouldExpand?: ((x: CollapsedFieldProps) => boolean)) {
    try {
        if (!msg || !msg.value) return <code>null</code>
        const shouldCollapse = shouldExpand ? shouldExpand : false;

        if (msg.valueType == 'binary') {
            const mode = 'ascii' as ('ascii' | 'raw' | 'hex');
            if (mode == 'raw') {
                return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{msg.value}</code>
            }
            else if (mode == 'hex') {
                const str = msg.value as string;
                var hex = '';
                for (var i = 0; i < str.length; i++) {
                    let n = str.charCodeAt(i).toString(16);
                    if (n.length == 1) n = '0' + n;
                    hex += n + ' ';
                }

                return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{hex}</code>
            }
            else {
                const str = msg.value as string;
                var result = '';
                const isPrintable = /[\x20-\x7E]/;
                for (var i = 0; i < str.length; i++) {
                    let ch = String.fromCharCode(str.charCodeAt(i)); // str.charAt(i);
                    ch = isPrintable.test(ch) ? ch : '. ';
                    result += ch + ' ';
                }

                return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{result}</code>
            }
        }

        return (
            <>
                {/* <Affix offsetTop={30}>
                    <Button icon='copy' shape='circle' size='large'
                        style={{ float: 'right', margin: '1em', zIndex: 10 }} />
                </Affix> */}

                <ReactJson
                    style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}
                    displayDataTypes={false} displayObjectSize={true} enableClipboard={false}
                    src={msg.value}
                    name={null}
                    collapseStringsAfterLength={40}
                    groupArraysAfterLength={100}
                    indentWidth={5}
                    iconStyle='triangle'
                    collapsed={2}
                    shouldCollapse={shouldCollapse}
                />
            </>
        )
    }
    catch (e) {
        return <span style={{ color: 'red' }}>Error in RenderExpandedMessage: {e.toString()}</span>
    }
}



@observer
class CustomTagList extends Component<{ tags: PreviewTag[], allCurrentKeys: string[] }> {
    @observable inputVisible = false;
    @observable inputValue = '';

    @observable activeTags: string[] = [];

    render() {

        const tagSuggestions = this.props.allCurrentKeys.filter(k => this.props.tags.all(t => t.value != k));

        return <>
            <AnimatePresence>
                <MotionDiv positionTransition>

                    {this.props.tags.map(v => <CustomTag key={v.value} tag={v} tagList={this} />)}

                    {this.inputVisible &&
                        <motion.span positionTransition>
                            {/* <Input
                                ref={r => { if (r) { r.focus(); } }}
                                type="text"
                                size="small"
                                style={{ width: 78 }}
                                value={this.inputValue}
                                onChange={e => this.inputValue = e.target.value}
                                onBlur={this.handleInputConfirm}
                                onPressEnter={this.handleInputConfirm}
                            /> */}
                            <span onKeyDown={e => {
                                if (e.key == 'Enter') this.handleInputConfirm();
                                if (e.key == 'Escape') { this.inputValue = ''; this.handleInputConfirm(); }
                            }}>
                                <AutoComplete
                                    ref={r => { if (r) { r.focus(); } }}

                                    dataSource={tagSuggestions}

                                    size="small"
                                    style={{ width: 130 }}
                                    value={this.inputValue}
                                    onChange={e => this.inputValue = e.toString()}
                                    onBlur={() => { this.inputValue = ''; this.handleInputConfirm(); }}
                                    filterOption={true}
                                />
                            </span>

                        </motion.span>
                    }

                    {!this.inputVisible &&
                        <motion.span positionTransition>
                            <Button onClick={() => this.inputVisible = true} size='small' type='dashed'>
                                <Icon type='plus' style={{ color: '#999' }} />
                                <>Add Preview</>
                            </Button>
                        </motion.span>
                    }

                    <br />

                    {/* <Select<string> mode='tags'
                        style={{ minWidth: '26em' }} size='large'
                        placeholder='Enter properties for preview'
                    >
                        {tagSuggestions.map(k =>
                            <Select.Option key={k} value={k}>{k}</Select.Option>
                        )}
                    </Select> */}

                </MotionDiv>
            </AnimatePresence>
        </>
    }

    handleInputConfirm = () => {
        const tags = this.props.tags;
        const newTag = this.inputValue;
        if (newTag && tags.all(t => t.value != newTag)) {
            tags.push({ value: newTag, active: true });
        }
        this.inputVisible = false;
        this.inputValue = '';
    };

    get tags(): PreviewTag[] { return this.props.tags; }
    get tagNames(): string[] { return this.props.tags.map(t => t.value); }
    get activeTagNames(): string[] { return this.props.tags.filter(t => t.active).map(t => t.value); }

    setTagActive(tag: string, isActive: boolean) {
        if (!isActive) {
            this.activeTags.remove(tag);
        } else {
            this.activeTags.push(tag);
        }
    }

    removeTag(tag: string) {
        this.props.tags.removeAll(t => t.value === tag);
    }
}

@observer
class CustomTag extends Component<{ tag: PreviewTag, tagList: CustomTagList }> {
    @observable isActive = false;

    render() {
        const tag = this.props.tag;
        const list = this.props.tagList;
        const value = tag.value;

        return <motion.span>
            <Tag
                color={tag.active ? 'blue' : undefined}
                key={value}
                onClick={() => tag.active = !tag.active}
                closable
                onClose={() => list.removeTag(value)}
            >{value}</Tag>
        </motion.span>
    }
}
