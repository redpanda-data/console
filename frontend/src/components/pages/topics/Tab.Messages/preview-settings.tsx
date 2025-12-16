/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { GearIcon, ThreeBarsIcon, XIcon } from '@primer/octicons-react';
import { Box, Button, Checkbox, Flex, Input, Popover } from '@redpanda-data/ui';
import { arrayMoveMutable } from 'array-move';
import React from 'react';
import {
  DragDropContext,
  Draggable,
  type DraggableProvided,
  Droppable,
  type DropResult,
  type ResponderProvided,
} from 'react-beautiful-dnd';

import { globHelp, PatternHelpDrawer } from './preview-settings/pattern-help-drawer';
import { usePreviewDisplayMode } from '../../../../hooks/use-preview-display-mode';
import { usePreviewMultiResultMode } from '../../../../hooks/use-preview-multi-result-mode';
import { usePreviewTagsCaseSensitive } from '../../../../hooks/use-preview-tags-case-sensitive';
import type { TopicMessage } from '../../../../state/rest-interfaces';
import type { PreviewTagV2 } from '../../../../state/ui';
import { useTopicSettingsStore } from '../../../../stores/topic-settings-store';
import { IsDev } from '../../../../utils/env';
import { Label, OptionGroup, toSafeString } from '../../../../utils/tsx-utils';
import { type CollectedProperty, collectElements2, getAllMessageKeys, randomId } from '../../../../utils/utils';
import { SingleSelect } from '../../../misc/select';

export const PreviewSettings = ({ messages, topicName }: { messages: TopicMessage[]; topicName: string }) => {
  const [caseSensitive, setCaseSensitive] = usePreviewTagsCaseSensitive(topicName);
  const [multiResultMode, setMultiResultMode] = usePreviewMultiResultMode(topicName);
  const [displayMode, setDisplayMode] = usePreviewDisplayMode(topicName);
  const { setPreviewTags: setStoredPreviewTags, perTopicSettings } = useTopicSettingsStore();

  const currentKeys = getAllMessageKeys(messages)
    .map((p) => p.propertyName)
    .distinct();

  // Access perTopicSettings to trigger re-render when it changes
  const tags = perTopicSettings.find((t) => t.topicName === topicName)?.previewTags ?? [];

  // add ids to elements that don't have any
  const getFreeId = (): string => {
    let i = 1;
    while (tags.any((t) => t.id === String(i))) {
      i++;
    }
    return String(i);
  };

  const filteredTags = tags.filter((t) => t.id);
  for (const tag of filteredTags) {
    tag.id = getFreeId();
  }

  const onDragEnd = (result: DropResult, _provided: ResponderProvided) => {
    if (!result.destination) {
      return;
    }
    const newTags = [...tags];
    arrayMoveMutable(newTags, result.source.index, result.destination.index);
    setStoredPreviewTags(topicName, newTags);
  };

  const content = (
    <>
      <div>
        <span>
          When viewing large messages we're often only interested in a few specific fields. Add <PatternHelpDrawer />
          <Popover content={globHelp} hideCloseButton placement="bottom" size="auto" trigger={'click'} /> to this list
          to show found values as previews.
        </span>
      </div>

      <div className="previewTagsList">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="droppable">
            {(droppableProvided, _droppableSnapshot) => (
              <div ref={droppableProvided.innerRef} style={{ display: 'flex', flexDirection: 'column' }}>
                {tags.map((tag, index) => (
                  <Draggable draggableId={tag.id} index={index} key={tag.id}>
                    {(draggableProvided, _draggableSnapshot) => (
                      <div ref={draggableProvided.innerRef} {...draggableProvided.draggableProps}>
                        <PreviewTagSettings
                          allCurrentKeys={currentKeys}
                          draggableProvided={draggableProvided}
                          index={index}
                          onRemove={() => {
                            const newTags = tags.filter((t) => t.id !== tag.id);
                            setStoredPreviewTags(topicName, newTags);
                          }}
                          tag={tag}
                          topicName={topicName}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {droppableProvided.placeholder}
                <Button
                  onClick={() => {
                    const newTag: PreviewTagV2 = {
                      id: getFreeId(),
                      isActive: true,
                      pattern: '',
                      searchInMessageHeaders: false,
                      searchInMessageKey: false,
                      searchInMessageValue: true,
                    };
                    const newTags = [...tags, newTag];
                    setStoredPreviewTags(topicName, newTags);
                  }}
                  variant="outline"
                >
                  Add entry...
                </Button>
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      <div style={{ marginTop: '1em' }}>
        <h3 style={{ marginBottom: '0.5em' }}>Settings</h3>
        <div className="previewTagsSettings">
          <OptionGroup<'caseSensitive' | 'ignoreCase'>
            label="Matching"
            onChange={(e) => setCaseSensitive(e)}
            options={{ 'Ignore Case': 'ignoreCase', 'Case Sensitive': 'caseSensitive' }}
            value={caseSensitive}
          />
          <OptionGroup<'showOnlyFirst' | 'showAll'>
            label="Multiple Results"
            onChange={(e) => setMultiResultMode(e)}
            options={{ 'First result': 'showOnlyFirst', 'Show All': 'showAll' }}
            value={multiResultMode}
          />

          <OptionGroup<'single' | 'wrap' | 'rows'>
            label="Wrapping"
            onChange={(e) => setDisplayMode(e)}
            options={{ 'Single Line': 'single', Wrap: 'wrap', Rows: 'rows' }}
            value={displayMode}
          />
        </div>
      </div>
    </>
  );

  return <Box>{content}</Box>;
};

/*
todo:
- mark patterns red when they are invalid
- better auto-complete: get suggestions from current pattern (except for last segment)
-
 */
const PreviewTagSettings = ({
  tag,
  onRemove,
  allCurrentKeys,
  draggableProvided,
  topicName,
}: {
  tag: PreviewTagV2;
  index: number;
  onRemove: () => void;
  allCurrentKeys: string[];
  draggableProvided: DraggableProvided;
  topicName: string;
}) => {
  const { getPreviewTags: getStoredTags, setPreviewTags: setStoredTags } = useTopicSettingsStore();

  const updateTag = (updates: Partial<PreviewTagV2>) => {
    const allTags = getStoredTags(topicName);
    const newTags = allTags.map((t) => (t.id === tag.id ? { ...t, ...updates } : t));
    setStoredTags(topicName, newTags);
  };

  return (
    <Flex borderRadius={1} gap={1} mb={1.5} p={1} placeItems="center">
      {/* Move Handle */}
      <span className="moveHandle" {...draggableProvided.dragHandleProps}>
        <ThreeBarsIcon />
      </span>

      {/* Enabled */}
      <Checkbox isChecked={tag.isActive} onChange={(e) => updateTag({ isActive: e.target.checked })} />

      {/* Settings */}
      <Popover
        content={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3em' }}>
            <Label style={{ marginBottom: '.5em' }} text="Display Name">
              <Input
                autoComplete={randomId()}
                flexBasis={50}
                flexGrow={1}
                onChange={(e) => updateTag({ customName: e.target.value })}
                placeholder="Enter a display name..."
                size="sm"
                spellCheck={false}
                value={tag.customName}
              />
            </Label>

            <span>
              <Checkbox
                isChecked={tag.searchInMessageKey}
                onChange={(e) => updateTag({ searchInMessageKey: e.target.checked })}
              >
                Search in message key
              </Checkbox>
            </span>
            <span>
              <Checkbox
                isChecked={tag.searchInMessageValue}
                onChange={(e) => updateTag({ searchInMessageValue: e.target.checked })}
              >
                Search in message value
              </Checkbox>
            </span>
          </div>
        }
        hideCloseButton
        placement="bottom-start"
        size="auto"
        trigger={'click'}
      >
        <span className="inlineButton">
          <GearIcon />
        </span>
      </Popover>

      <Box w="full">
        <SingleSelect<string>
          creatable
          onChange={(value) => updateTag({ pattern: value })}
          options={allCurrentKeys.map((t) => ({ label: t, value: t }))}
          placeholder="Pattern..."
          value={tag.pattern}
        />
      </Box>

      {/* Remove */}
      <button className="inlineButton" onClick={onRemove} type="button">
        <XIcon />
      </button>
    </Flex>
  );
};

/*
todo:
- support regex patterns as path elements
    - `data./pattern/.email`
    - in order to match `/pattern/` our 'parseJsonPath' must support escaping forward slashes: "\/"

*/
export function getPreviewTags(
  targetObject: Record<string, unknown>,
  tags: PreviewTagV2[],
  caseSensitive: boolean
): React.ReactNode[] {
  const ar: React.ReactNode[] = [];
  const results: { prop: CollectedProperty; tag: PreviewTagV2; fullPath: string }[] = [];

  for (const t of tags) {
    if (t.pattern.length === 0) {
      continue;
    }

    const trimmed = t.pattern.trim();
    const searchPath = parseJsonPath(trimmed);
    if (searchPath === null) {
      continue;
    }
    if (typeof searchPath === 'string') {
      continue; // todo: show error to user
    }

    const foundProperties = collectElements2(targetObject, searchPath, (pathElement, propertyName) => {
      // We'll never get called for '*' or '**' patterns
      // So we can be sure that the pattern is not just '*'
      const segmentRegex = caseSensitive ? wildcardToRegex(pathElement) : new RegExp(wildcardToRegex(pathElement), 'i');
      return segmentRegex.test(propertyName);
    });

    for (const p of foundProperties) {
      results.push({
        tag: t,
        prop: p,
        fullPath: p.path.join('.'),
      });
    }
  }

  // order results by the tag they were created from, and then their path
  results.sort((a, b) => {
    if (a.tag !== b.tag) {
      const indexA = tags.indexOf(a.tag);
      const indexB = tags.indexOf(b.tag);
      return indexA - indexB;
    }

    // first sort by path length
    const pathLengthDiff = a.prop.path.length - b.prop.path.length;
    if (pathLengthDiff !== 0) {
      return pathLengthDiff;
    }

    // then alphabetically
    const pathA = a.fullPath;
    const pathB = b.fullPath;
    return pathA.localeCompare(
      pathB,
      undefined, // no locales
      {
        numeric: true,
        ignorePunctuation: false,
        sensitivity: 'base',
      }
    );
  });

  // found some properties, create JSX for them
  for (const r of results) {
    const tag = r.tag;

    const displayName = tag.customName && tag.customName.length > 0 ? tag.customName : r.fullPath;

    ar.push(
      <span className="previewTag">
        <span className="path">{displayName}</span>
        <span>{toSafeString(r.prop.value)}</span>
      </span>
    );
  }

  return ar;
}

const splitChars = ["'", '"', '.'];
// Splits a given path into its path segments.
// Path segments are seperated by the dot-character.
// This function also supports quotes, so that the dot can still be used (the path segment just needs to be wrapped in quotes then).
// Returns:
// - String array when the path was parsed correctly
// - Single string as error reason why the path couldn't be parsed
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 34, refactor later
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
      case '"':
        // A quote is opened
        // Find the closing quote and collect everything in-between

        start = pos + 1; // start just after the quote
        end = str.indexOf(c, start); // and collect until the closing quote

        if (end === -1) {
          return `missing closing quote, quote was opened at index ${start - 1}`;
        }
        match = str.slice(start, end);

        if (match.length > 0) {
          result.push(match);
        }

        pos = end === -1 ? str.length : end + 1; // continue after the end of our string and the closing quote
        break;

      case '.':
        // A dot, skip over it

        if (pos === 0) {
          return 'pattern cannot start with a dot';
        }
        pos++;
        if (pos >= str.length) {
          return 'pattern can not end with a dot';
        }
        c = str[pos];
        if (c === '.') {
          return 'pattern cannot contain more than one dot in a row';
        }
        break;

      default:
        // We're at a simple character, just collect everything until the next dot or quote
        start = pos; // start here
        end = indexOfMany(str, splitChars, pos); // collect until dot or quote

        match = end >= 0 ? str.slice(start, end) : str.slice(start, str.length);

        if (match.length > 0) {
          result.push(match);
        }

        pos = end === -1 ? str.length : end; // continue after the end
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
    if (segment !== '**' && segment.includes('**')) {
      return "path segment '**' must not have anything before or after it (except for dots of course)";
    }
  }

  return result;
}

function indexOfMany(str: string, matches: string[], position: number): number {
  const indices: number[] = matches.map((_) => -1);
  // for every string we want to find, record the index of its first occurance
  for (let i = 0; i < matches.length; i++) {
    indices[i] = str.indexOf(matches[i], position);
  }

  // find the first match (smallest value in our results)
  // but skip over -1, because that means the string didn't contain that match
  let smallest = -1;
  for (const i of indices) {
    if (smallest === -1 || i < smallest) {
      smallest = i;
    }
  }

  return smallest;
}

if (IsDev) {
  const tests = [
    // simple case
    { input: 'abc', output: ['abc'] },

    // single quotes, double quotes
    { input: '"xx"."yy"', output: ['xx', 'yy'] },
    { input: "'xx'.'yy'", output: ['xx', 'yy'] },
    { input: '".".\'.\'', output: ['.', '.'] },

    // keys with split-characters inside them
    { input: '"\'a.\'b".asdf', output: ["'a.'b", 'asdf'] },
    { input: '"x.y.z".firstName', output: ['x.y.z', 'firstName'] },
    { input: 'a.".b"', output: ['a', '.b'] },
    { input: "a.'.b'", output: ['a', '.b'] },
    { input: 'a.\'""".b"\'', output: ['a', '""".b"'] },
    { input: 'a.\'""".b\'', output: ['a', '""".b'] },

    // empty
    { input: '', output: [] },
    { input: "''", output: [] },
    { input: '""', output: [] },

    // invalid inputs
    // missing closing quotes
    { input: '"', output: null },
    { input: '."', output: null },
    { input: '".', output: null },
    { input: "'", output: null },
    { input: ".'", output: null },
    { input: "'.", output: null },

    // dots at the wrong location
    { input: '.', output: null },
    { input: "'a'.", output: null },
    { input: '.a', output: null },
    { input: ".'a'", output: null },
    { input: 'a..b', output: null },
  ];

  for (const test of tests) {
    const expected = test.output;
    let result = parseJsonPath(test.input);

    if (typeof result === 'string') {
      result = null as unknown as string[]; // string means error message
    }

    if (result === null && expected === null) {
      continue;
    }

    let hasError = false;
    if (result === null && expected !== null) {
      hasError = true; // didn't match when it should have
    }
    if (result !== null && expected === null) {
      hasError = true; // matched something we don't want
    }

    if (!hasError && result && expected) {
      if (result.length !== expected.length) {
        hasError = true; // wrong length
      }

      for (let i = 0; i < result.length && !hasError; i++) {
        if (result[i] !== expected[i]) {
          hasError = true; // wrong array entry
        }
      }
    }

    if (hasError) {
      throw new Error(
        `Error in parseJsonPath test:\nTest: ${JSON.stringify(test)}\nActual Result: ${JSON.stringify(result)}`
      );
    }
  }
}

function wildcardToRegex(pattern: string): RegExp {
  const components = pattern.split('*'); // split by '*' symbol
  const escapedComponents = components.map(regexEscape); // ensure the components don't contain regex special characters
  const joined = escapedComponents.join('.*'); // join components, adding back the wildcard
  return new RegExp(`^${joined}$`);
}

function regexEscape(regexPattern: string): string {
  return regexPattern.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
