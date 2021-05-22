import { FilterOutlined, PlusOutlined } from "@ant-design/icons";
import { ThreeBarsIcon, XIcon } from "@primer/octicons-v2-react";
import { AutoComplete, Button, Checkbox, Input, Modal, Space, Typography } from "antd";
import Item from "antd/lib/list/Item";
import Paragraph from "antd/lib/typography/Paragraph";
import arrayMove from "array-move";
import { AnimatePresence, motion } from "framer-motion";
import { computed, makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import { Component } from "react";
import { DragDropContext, Draggable, DragUpdate, Droppable, DroppableProvided, DropResult, ResponderProvided } from "react-beautiful-dnd";
import { api } from "../../../../state/backendApi";
import { PreviewTag } from "../../../../state/ui";
import { uiState } from "../../../../state/uiState";
import { MotionDiv } from "../../../../utils/animationProps";
import { clone, toJson } from "../../../../utils/jsonUtils";
import { OptionGroup, toSafeString } from "../../../../utils/tsxUtils";
import { findElementDeep, findElementDeepEx, getAllMessageKeys, randomId } from "../../../../utils/utils";

const { Text } = Typography;



@observer
export class PreviewSettings extends Component<{ getShowDialog: () => boolean, setShowDialog: (show: boolean) => void }> {
    @computed.struct get allCurrentKeys() {
        const unused = api.messages.length;
        // console.log("get all current keys: " + unused);
        return getAllMessageKeys(api.messages).map(p => p.propertyName).distinct();
    }

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }


    render() {
        const currentKeys = this.props.getShowDialog() ? this.allCurrentKeys : [];

        const tags = uiState.topicSettings.previewTags;
        // add ids to elements that don't have any
        const getFreeId = function (): string {
            let i = 1;
            while (tags.any(t => t.id == String(i))) i++;
            return String(i);
        }
        tags.filter(t => !t.id).forEach(t => t.id = getFreeId());


        const onDragEnd = function (result: DropResult, provided: ResponderProvided) {
            if (!result.destination) return;
            arrayMove.mutate(tags, result.source.index, result.destination.index);
        }

        const content = <>
            <Paragraph>
                <Text>
                    When viewing large messages we're often only interested in a few specific fields.
                    Add json keys to this list to show them as previews.<br />
                </Text>
            </Paragraph>

            <div className="previewTagsList">
                <DragDropContext onDragEnd={onDragEnd} >
                    <Droppable droppableId="droppable">
                        {(droppableProvided, droppableSnapshot) => (
                            <div
                                ref={droppableProvided.innerRef}
                                style={{ display: 'flex', flexDirection: 'column' }}
                            >
                                {tags.map((tag, index) => (
                                    <Draggable key={tag.id} draggableId={tag.id} index={index}>
                                        {(draggableProvided, draggableSnapshot) => (
                                            <div
                                                ref={draggableProvided.innerRef}
                                                {...draggableProvided.draggableProps}
                                                {...draggableProvided.dragHandleProps}
                                            >
                                                <SortItem tag={tag} index={index}
                                                    onRemove={() => tags.removeAll(t => t.id == tag.id)}
                                                    allCurrentKeys={currentKeys}
                                                />
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {droppableProvided.placeholder}
                                <Button onClick={() => tags.push({ id: getFreeId(), isActive: true, text: '' })}>Add entry...</Button>
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>

                {/* <CustomTagList tags={uiState.topicSettings.previewTags} allCurrentKeys={this.props.allCurrentKeys} /> */}
            </div>

            <div style={{ marginTop: '1em' }}>
                <h3 style={{ marginBottom: '0.5em' }}>Settings</h3>
                <div className="previewTagsSettings" >
                    <OptionGroup label='Matching' options={{ 'Ignore Case': false, 'Case Sensitive': true }} size='small'
                        value={uiState.topicSettings.previewTagsCaseSensitive}
                        onChange={e => uiState.topicSettings.previewTagsCaseSensitive = e}
                    />
                    <OptionGroup label='Multiple Results' options={{ 'First result': 'showOnlyFirst', 'Show All': 'showAll' }}
                        value={uiState.topicSettings.previewMultiResultMode}
                        onChange={e => uiState.topicSettings.previewMultiResultMode = e}
                    />

                    <OptionGroup label='Wrapping' options={{ 'Single Line': 'single', 'Wrap': 'wrap', 'Rows': 'rows' }}
                        value={uiState.topicSettings.previewDisplayMode}
                        onChange={e => uiState.topicSettings.previewDisplayMode = e}
                    />
                </div>
            </div>
        </>

        return <Modal
            title={<span><FilterOutlined style={{ fontSize: '22px', verticalAlign: 'bottom', marginRight: '16px', color: 'hsla(209, 20%, 35%, 1)' }} />Preview Fields</span>}
            visible={this.props.getShowDialog()}

            style={{ minWidth: '750px', maxWidth: '1000px', top: '26px' }}
            width={'auto'}
            bodyStyle={{ paddingTop: '12px' }}
            centered={false}


            okText='Close'
            cancelButtonProps={{ style: { display: 'none' } }}
            onOk={() => this.props.setShowDialog(false)}
            onCancel={() => this.props.setShowDialog(false)}

            closable={false}
            maskClosable={true}
        >
            {content}
        </Modal>;
    }
}

@observer
class SortItem extends Component<{ tag: PreviewTag, index: number, onRemove: () => void, allCurrentKeys: string[] }>{
    render() {
        const { tag, index, onRemove, allCurrentKeys } = this.props;

        return <div style={{
            display: 'flex', placeItems: 'center', gap: '4px',
            background: 'hsl(0deg, 0%, 91%)', padding: '4px', borderRadius: '4px',
            marginBottom: '6px'
        }}>

            {/* Move Handle */}
            <span className="moveHandle"><ThreeBarsIcon /></span>

            {/* Enabled */}
            <Checkbox checked={tag.isActive} onChange={e => tag.isActive = e.target.checked} />

            {/* Pattern */}
            {/* <span className="description">Pattern</span> */}
            <AutoComplete options={allCurrentKeys.map(t => ({ label: t, value: t }))}
                size="small"
                style={{ flexGrow: 1, flexBasis: '400px' }}

                defaultActiveFirstOption={true}
                onSearch={(value) => {
                    // console.log('onSearch ', value);
                }}
                value={tag.text}

                onChange={e => tag.text = e}
                placeholder="Pattern..."
                filterOption={(inputValue, option) => option?.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1}

                notFoundContent="None"

                {...{ spellCheck: "false" }}
            />

            {/* Name */}
            {/* <span className="description">Display Name</span> */}
            <Input size='small' style={{ flexGrow: 1, flexBasis: '50px' }}
                value={tag.customName}
                onChange={e => tag.customName = e.target.value}
                autoComplete={randomId()}
                spellCheck={false}
                placeholder="Display Name..."
            />

            {/* Remove */}
            <span className="removeButton" onClick={onRemove} ><XIcon /></span>
        </div>
    }
}

export function getPreviewTags(messageValue: any, tags: PreviewTag[]): React.ReactNode[] {
    const ar: React.ReactNode[] = [];

    const onlyFirst = uiState.topicSettings.previewMultiResultMode == 'showOnlyFirst';

    for (const t of tags) {
        if (t.text.length == 0) continue;
        const searchPath = t.text.trim().split('.');
        const lastProp = searchPath[searchPath.length - 1];

        const results = findElementDeepEx(messageValue, (prop, path, value) => {
            if (prop != lastProp) return false;

            // check if the path can potentially match
            if ((path.length + 1) < searchPath.length)
                return false; // our search requires more tags than are available

            // check if parent path matches
            let searchIndex = searchPath.length - 2;
            let pathIndex = path.length - 1;

            while (searchIndex >= 0 && pathIndex >= 0) {
                // is it a match?
                if (searchPath[searchIndex] != path[pathIndex])
                    return false;

                searchIndex--;
                pathIndex--;
            }

            // if we didn't reach the end of our search, that means the search query is longer than any checked path
            if (searchIndex > 0) return false;

            return true;

        }, onlyFirst);



        // found some properties, create JSX for them
        for (const r of results) {
            r.path.push(r.propertyName);

            const displayName = t.customName && t.customName.length > 0
                ? t.customName
                : r.path.join('.');

            ar.push(<span className='previewTag'>
                <span className='path'>{displayName}</span>
                <span>{toSafeString(r.value)}</span>
            </span >)
        }

        // if (results.length > 0) {
        //     const propName = (!searchOptions.returnFirstResult && uiState.topicSettings.previewShowResultCount)
        //         ? `${results[0].propertyName}(${results.length})`
        //         : results[0].propertyName;

        //     if (results.length == 1 || searchOptions.returnFirstResult)
        //         previewObj[propName] = results[0].value; // show only first value
        //     else
        //         previewObj[propName] = results.map(r => r.value); // show array of all found values
        // }
    }


    return ar;
}