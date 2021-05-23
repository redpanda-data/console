import { FilterOutlined, PlusOutlined } from "@ant-design/icons";
import { ThreeBarsIcon, XIcon } from "@primer/octicons-v2-react";
import { AutoComplete, Button, Checkbox, Input, message, Modal, Space, Typography } from "antd";
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
import { IsDev } from "../../../../utils/env";
import { clone, toJson } from "../../../../utils/jsonUtils";
import { OptionGroup, toSafeString } from "../../../../utils/tsxUtils";
import { findElementDeep, collectElements, getAllMessageKeys, randomId, collectElements2, CollectedProperty } from "../../../../utils/utils";

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
                    Add patterns to this list to show found values as previews.
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
                                                <PreviewTagSettings tag={tag} index={index}
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
class PreviewTagSettings extends Component<{ tag: PreviewTag, index: number, onRemove: () => void, allCurrentKeys: string[] }>{
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

/*
todo:
- support regex patterns as path elements
    - `data./pattern/.email`
    - in order to match `/pattern/` our 'parseJsonPath' must support escaping forward slashes: "\/"

*/
export function getPreviewTags(messageValue: any, tags: PreviewTag[]): React.ReactNode[] {
    const ar: React.ReactNode[] = [];

    const results: { prop: CollectedProperty, tag: PreviewTag, fullPath: string }[] = [];
    // const onlyFirst = uiState.topicSettings.previewMultiResultMode == 'showOnlyFirst';

    for (const t of tags) {
        if (t.text.length == 0) continue;

        const trimmed = t.text.trim();
        const searchPath = parseJsonPath(trimmed);
        if (searchPath == null) continue;
        if (typeof searchPath == 'string') continue; // todo: show error to user

        const foundProperties = collectElements2(messageValue, searchPath, (pathElement, propertyName, value) => {
            // We'll never get called for '*' or '**' patterns
            // So we can be sure that the pattern is not just '*'
            if (pathElement.includes("*")) {
                const segment = wildcardToRegex(pathElement);
                return segment.test(propertyName);
            }
            if (pathElement == propertyName)
                return true;

            return false;
        });

        for (const p of foundProperties)
            results.push({
                tag: t,
                prop: p,
                fullPath: p.path.join('.'),
            });
    }

    // order results by their path
    results.sort((a, b) => {
        const pathA = a.fullPath;
        const pathB = b.fullPath;
        return pathA.localeCompare(pathB,
            undefined, // no locales
            {
                numeric: true,
                ignorePunctuation: false,
                sensitivity: 'base',
            });
    });

    // found some properties, create JSX for them
    for (const r of results) {
        const tag = r.tag;

        const displayName = tag.customName && tag.customName.length > 0
            ? tag.customName
            : r.fullPath;

        ar.push(<span className='previewTag'>
            <span className='path'>{displayName}</span>
            <span>{toSafeString(r.prop.value)}</span>
        </span >)
    }

    return ar;
}

const splitChars = ["'", "\"", "."];
// Splits a given path into its path segments.
// Path segments are seperated by the dot-character.
// This function also supports quotes, so that the dot can still be used (the path segment just needs to be wrapped in quotes then).
// Returns:
// - String array when the path was parsed correctly
// - Single string as error reason why the path couldn't be parsed
function parseJsonPath(str: string): string[] | string {
    // Collect symbols until we find a dot, single-quote, or double-quote
    const result: string[] = [];

    let pos = 0;
    while (pos < str.length) {
        let c = str[pos];
        let start: number;
        let end: number;
        let match: string;
        switch (c) {
            case "'":
            case "\"":
                // A quote is opened
                // Find the closing quote and collect everything in-between

                start = pos + 1; // start just after the quote
                end = str.indexOf(c, start); // and collect until the closing quote

                if (end == -1) return "missing closing quote, quote was opened at index " + (start - 1);
                match = str.slice(start, end);

                if (match.length > 0)
                    result.push(match);

                pos = end == -1 ? str.length : end + 1; // continue after the end of our string and the closing quote
                break;

            case ".":
                // A dot, skip over it

                if (pos == 0) return "pattern cannot start with a dot";
                pos++;
                if (pos >= str.length) return "pattern can not end with a dot";
                c = str[pos];
                if (c == '.') return "pattern cannot contain more than one dot in a row";
                break;

            default:
                // We're at a simple character, just collect everything until the next dot or quote
                start = pos; // start here
                end = indexOfMany(str, splitChars, pos); // collect until dot or quote

                match = end >= 0
                    ? str.slice(start, end)
                    : str.slice(start, str.length);

                if (match.length > 0)
                    result.push(match);

                pos = end == -1 ? str.length : end; // continue after the end
                break;
        }
    }

    // While we do support the '**' pattern, it must always appear alone.
    // In other words, a path segment is valid if it is exactly equal to '**',
    // but it is invalid if it contains '**'
    //
    // Valid example paths: can appear anywhere as long as it is
    //    **.a.b.c
    //    a.b.**.c.**
    //    a.b.**
    //
    // Invalid example paths:
    //    b**c.d
    //    a.b**
    //    a.**b
    //

    for (const segment of result) {
        if (segment != "**" && segment.includes("**"))
            return "path segment '**' must not have anything before or after it (except for dots of course)";
    }

    return result;
}

function indexOfMany(str: string, matches: string[], position: number): number {

    const indices: number[] = matches.map(_ => -1);
    // for every string we want to find, record the index of its first occurance
    for (let i = 0; i < matches.length; i++)
        indices[i] = str.indexOf(matches[i], position);

    // find the first match (smallest value in our results)
    // but skip over -1, because that means the string didn't contain that match
    let smallest = -1;
    for (const i of indices) {
        if (smallest == -1 || i < smallest)
            smallest = i;
    }

    return smallest;
}

if (IsDev) {
    const tests = [
        // simple case
        { input: `abc`, output: [`abc`] },

        // single quotes, double quotes
        { input: `"xx"."yy"`, output: [`xx`, `yy`] },
        { input: `'xx'.'yy'`, output: [`xx`, `yy`] },
        { input: `".".'.'`, output: [`.`, `.`] },

        // keys with split-characters inside them
        { input: `"'a.'b".asdf`, output: [`'a.'b`, `asdf`] },
        { input: `"x.y.z".firstName`, output: [`x.y.z`, `firstName`] },
        { input: `a.".b"`, output: [`a`, `.b`] },
        { input: `a.'.b'`, output: [`a`, `.b`] },
        { input: `a.'""".b"'`, output: [`a`, `""".b"`] },
        { input: `a.'""".b'`, output: [`a`, `""".b`] },

        // empty
        { input: ``, output: [] },
        { input: `''`, output: [] },
        { input: `""`, output: [] },

        // invalid inputs
        // missing closing quotes
        { input: `"`, output: null },
        { input: `."`, output: null },
        { input: `".`, output: null },
        { input: `'`, output: null },
        { input: `.'`, output: null },
        { input: `'.`, output: null },

        // dots at the wrong location
        { input: `.`, output: null },
        { input: `'a'.`, output: null },
        { input: `.a`, output: null },
        { input: `.'a'`, output: null },
        { input: `a..b`, output: null },
    ]

    for (const test of tests) {
        const expected = test.output;
        let result = parseJsonPath(test.input);

        if (typeof result == 'string') result = null as unknown as string[]; // string means error message

        if (result === null && expected === null)
            continue;

        let hasError = false;
        if (result === null && expected !== null)
            hasError = true; // didn't match when it should have
        if (result !== null && expected === null)
            hasError = true; // matched something we don't want

        if (!hasError && result && expected) {

            if (result.length != expected.length)
                hasError = true; // wrong length

            for (let i = 0; i < result.length && !hasError; i++)
                if (result[i] != expected[i])
                    hasError = true; // wrong array entry
        }

        if (hasError)
            throw new Error(`Error in parseJsonPath test:\nTest: ${JSON.stringify(test)}\nActual Result: ${JSON.stringify(result)}`);
    }
}

function wildcardToRegex(pattern: string): RegExp {
    const components = pattern.split('*'); // split by '*' symbol
    const escapedComponents = components.map(regexEscape); // ensure the components don't contain regex special characters
    const joined = escapedComponents.join('.*'); // join components, adding back the wildcard
    return new RegExp('^' + joined + '$');
}

function regexEscape(regexPattern: string): string {
    return regexPattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}