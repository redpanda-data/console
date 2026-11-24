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

import {
  DragDropContext,
  Draggable,
  type DraggableProvided,
  Droppable,
  type DropResult,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import { arrayMoveMutable } from 'array-move';
import { CloseIcon, MenuIcon, SettingsIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { Input } from 'components/redpanda-ui/components/input';
import { Label as CheckboxLabel } from 'components/redpanda-ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import React from 'react';

import { PatternHelpDrawer } from './preview-settings/pattern-help-drawer';
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

function getFreeId(tags: PreviewTagV2[]) {
  const ids = new Set(tags.map((tag) => tag.id));
  let i = 1;
  while (ids.has(String(i))) {
    i += 1;
  }
  return String(i);
}

function assignFreeIds(tags: PreviewTagV2[]) {
  const filteredTags = tags.filter((t) => t.id);
  for (const tag of filteredTags) {
    tag.id = getFreeId(tags);
  }
}

/**
 * The editor does not currently highlight invalid patterns or scope autocomplete to the current path segment. Its checkbox labels are wired independently of the registry indicator.
 */
export const PreviewSettings = ({ messages, topicName }: { messages: TopicMessage[]; topicName: string }) => {
  const [caseSensitive, setCaseSensitive] = usePreviewTagsCaseSensitive(topicName);
  const [multiResultMode, setMultiResultMode] = usePreviewMultiResultMode(topicName);
  const [displayMode, setDisplayMode] = usePreviewDisplayMode(topicName);
  const { setPreviewTags: setStoredPreviewTags, perTopicSettings } = useTopicSettingsStore();

  const currentKeys = getAllMessageKeys(messages)
    .map((p) => p.propertyName)
    .distinct();

  // WARNING: Keep the subscription to per-topic settings; removing it leaves the preview fields stale after an edit.
  const tags = perTopicSettings.find((t) => t.topicName === topicName)?.previewTags ?? [];

  assignFreeIds(tags);

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
          When viewing large messages we're often only interested in a few specific fields. Add <PatternHelpDrawer /> to
          this list to show found values as previews.
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
                      id: getFreeId(tags),
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

  return <div>{content}</div>;
};

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
    <div className="mb-1.5 flex place-items-center gap-1 rounded-sm p-1">
      <span className="moveHandle" {...draggableProvided.dragHandleProps}>
        <MenuIcon />
      </span>

      <Checkbox
        aria-label={`Enable pattern ${tag.pattern || tag.id}`}
        checked={tag.isActive}
        onCheckedChange={(checked) => updateTag({ isActive: checked === true })}
      />

      <Popover>
        <PopoverTrigger
          render={
            <span className="inlineButton">
              <SettingsIcon />
            </span>
          }
        />
        <PopoverContent align="start" className="w-auto" side="bottom">
          <div className="flex flex-col gap-1">
            <Label style={{ marginBottom: '.5em' }} text="Display Name">
              <Input
                autoComplete={randomId()}
                onChange={(e) => updateTag({ customName: e.target.value })}
                placeholder="Enter a display name..."
                size="sm"
                spellCheck={false}
                value={tag.customName}
              />
            </Label>

            <span className="flex items-center gap-2">
              <Checkbox
                checked={tag.searchInMessageKey}
                id={`search-key-${tag.id}`}
                onCheckedChange={(checked) => updateTag({ searchInMessageKey: checked === true })}
              />
              <CheckboxLabel className="cursor-pointer" htmlFor={`search-key-${tag.id}`}>
                Search in message key
              </CheckboxLabel>
            </span>
            <span className="flex items-center gap-2">
              <Checkbox
                checked={tag.searchInMessageValue}
                id={`search-value-${tag.id}`}
                onCheckedChange={(checked) => updateTag({ searchInMessageValue: checked === true })}
              />
              <CheckboxLabel className="cursor-pointer" htmlFor={`search-value-${tag.id}`}>
                Search in message value
              </CheckboxLabel>
            </span>
          </div>
        </PopoverContent>
      </Popover>

      <div className="w-full">
        <SingleSelect<string>
          creatable
          onChange={(value) => updateTag({ pattern: value })}
          options={allCurrentKeys.map((t) => ({ label: t, value: t }))}
          placeholder="Pattern..."
          value={tag.pattern}
        />
      </div>

      <button className="inlineButton" onClick={onRemove} type="button">
        <CloseIcon />
      </button>
    </div>
  );
};

type TagMatch = { prop: CollectedProperty; tag: PreviewTagV2; fullPath: string };

function findTagMatches(targetObject: Record<string, unknown>, tag: PreviewTagV2, caseSensitive: boolean): TagMatch[] {
  if (tag.pattern.length === 0) {
    return [];
  }

  const searchPath = parseJsonPath(tag.pattern.trim());
  if (searchPath === null || typeof searchPath === 'string') {
    return [];
  }

  const foundProperties = collectElements2(targetObject, searchPath, (pathElement, propertyName) => {
    const segmentRegex = caseSensitive ? wildcardToRegex(pathElement) : new RegExp(wildcardToRegex(pathElement), 'iu');
    return segmentRegex.test(propertyName);
  });

  return foundProperties.map((p) => ({ tag, prop: p, fullPath: p.path.join('.') }));
}

function compareTagMatches(tags: PreviewTagV2[]) {
  return (a: TagMatch, b: TagMatch) => {
    if (a.tag !== b.tag) {
      const indexA = tags.indexOf(a.tag);
      const indexB = tags.indexOf(b.tag);
      return indexA - indexB;
    }

    const pathLengthDiff = a.prop.path.length - b.prop.path.length;
    if (pathLengthDiff !== 0) {
      return pathLengthDiff;
    }

    return a.fullPath.localeCompare(b.fullPath, undefined, {
      numeric: true,
      ignorePunctuation: false,
      sensitivity: 'base',
    });
  };
}

/**
 * Dots split path segments except inside a quoted segment. Invalid patterns produce no tags; regular expressions in slash-delimited segments are unsupported.
 */
export function getPreviewTags(targetObject: Record<string, unknown>, tags: PreviewTagV2[], caseSensitive: boolean) {
  const results = tags.flatMap((t) => findTagMatches(targetObject, t, caseSensitive));
  results.sort(compareTagMatches(tags));

  return results.map<React.ReactNode>((r, index) => {
    const tag = r.tag;
    const displayName = tag.customName && tag.customName.length > 0 ? tag.customName : r.fullPath;
    return (
      <span className="previewTag" key={`${tag.id}-${r.fullPath}-${index}`}>
        <span className="path">{displayName}</span>
        <span>{toSafeString(r.prop.value)}</span>
      </span>
    );
  });
}

const splitChars = ["'", '"', '.'];
function parseJsonPath(str: string): string[] | string {
  const segments = splitPathSegments(str);
  if (typeof segments === 'string') {
    return segments;
  }

  // WARNING: Accept a recursive wildcard only as its own segment; embedded double stars must not match unrelated fields.

  for (const segment of segments) {
    if (segment !== '**' && segment.includes('**')) {
      return "path segment '**' must not have anything before or after it (except for dots of course)";
    }
  }

  return segments;
}

type PathStep = { next: number; segment?: string } | { error: string };

function splitPathSegments(str: string): string[] | string {
  const result: string[] = [];

  let pos = 0;
  while (pos < str.length) {
    const step = readPathStep(str, pos);
    if ('error' in step) {
      return step.error;
    }
    if (step.segment) {
      result.push(step.segment);
    }
    pos = step.next;
  }

  return result;
}

function readPathStep(str: string, pos: number): PathStep {
  switch (str[pos]) {
    case "'":
    case '"':
      return readQuotedSegment(str, pos);
    case '.':
      return skipDot(str, pos);
    default:
      return readPlainSegment(str, pos);
  }
}

function readQuotedSegment(str: string, pos: number): PathStep {
  const start = pos + 1;
  const end = str.indexOf(str[pos], start);

  if (end === -1) {
    return { error: `missing closing quote, quote was opened at index ${start - 1}` };
  }

  return { next: end + 1, segment: str.slice(start, end) };
}

function skipDot(str: string, pos: number): PathStep {
  if (pos === 0) {
    return { error: 'pattern cannot start with a dot' };
  }
  const next = pos + 1;
  if (next >= str.length) {
    return { error: 'pattern can not end with a dot' };
  }
  if (str[next] === '.') {
    return { error: 'pattern cannot contain more than one dot in a row' };
  }
  return { next };
}

function readPlainSegment(str: string, pos: number) {
  const end = indexOfMany(str, splitChars, pos);

  const segment = end >= 0 ? str.slice(pos, end) : str.slice(pos, str.length);

  return { next: end === -1 ? str.length : end, segment } satisfies PathStep;
}

function indexOfMany(str: string, matches: string[], position: number) {
  const indices: number[] = matches.map((_) => -1);
  for (let i = 0; i < matches.length; i++) {
    indices[i] = str.indexOf(matches[i], position);
  }

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
    { input: 'abc', output: ['abc'] },

    { input: '"xx"."yy"', output: ['xx', 'yy'] },
    { input: "'xx'.'yy'", output: ['xx', 'yy'] },
    { input: '".".\'.\'', output: ['.', '.'] },

    { input: '"\'a.\'b".asdf', output: ["'a.'b", 'asdf'] },
    { input: '"x.y.z".firstName', output: ['x.y.z', 'firstName'] },
    { input: 'a.".b"', output: ['a', '.b'] },
    { input: "a.'.b'", output: ['a', '.b'] },
    { input: 'a.\'""".b"\'', output: ['a', '""".b"'] },
    { input: 'a.\'""".b\'', output: ['a', '""".b'] },

    { input: '', output: [] },
    { input: "''", output: [] },
    { input: '""', output: [] },

    { input: '"', output: null },
    { input: '."', output: null },
    { input: '".', output: null },
    { input: "'", output: null },
    { input: ".'", output: null },
    { input: "'.", output: null },

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
      result = null as unknown as string[];
    }

    if (result === null && expected === null) {
      continue;
    }

    let hasError = false;
    if (result === null && expected !== null) {
      hasError = true;
    }
    if (result !== null && expected === null) {
      hasError = true;
    }

    if (!hasError && result && expected) {
      if (result.length !== expected.length) {
        hasError = true;
      }

      for (let i = 0; i < result.length && !hasError; i++) {
        if (result[i] !== expected[i]) {
          hasError = true;
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

function wildcardToRegex(pattern: string) {
  const components = pattern.split('*');
  const escapedComponents = components.map(regexEscape);
  const joined = escapedComponents.join('.*');
  return new RegExp(`^${joined}$`, 'u');
}

function regexEscape(regexPattern: string) {
  return regexPattern.replace(/[/\\^$*+?.()|[\]{}]/gu, '\\$&');
}
