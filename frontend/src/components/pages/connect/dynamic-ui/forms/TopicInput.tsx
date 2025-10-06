/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import {
  Checkbox,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  Grid,
  Input,
  isMultiValue,
  Select,
} from '@redpanda-data/ui';
import { observer, useLocalObservable } from 'mobx-react';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import type { Property } from '../../../../../state/connect/state';
import { ExpandableText } from '../../../../misc/ExpandableText';

export const TopicInput = observer((p: { properties: Property[]; connectorType: 'sink' | 'source' }) => {
  const topics = useLegacyListTopicsQuery();

  const state = useLocalObservable(() => {
    const props = new Map(p.properties.map((p) => [p.name, p]));
    const topicsRegex = p.properties.find((x) => x.name === 'topics.regex');
    const initialSelection = topicsRegex?.value ? 'topics.regex' : 'topics';

    return {
      properties: props,
      _selected: initialSelection,
      get property() {
        // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
        return this.properties.get(this._selected)!;
      },
      get isRegex() {
        return this._selected === 'topics.regex';
      },
      setSelectedProp(input: string) {
        this.property.value = '';
        this._selected = input;
      },
    };
  });

  const allTopics = topics.data?.topics?.map((x) => x.topicName) ?? [];
  const matchingTopics = state.isRegex
    ? allTopics.filter((t) => {
        try {
          const regex = new RegExp(String(state.property.value));
          return regex.test(t);
        } catch {
          return false;
        }
      })
    : allTopics.filter((t) => String(state.property.value).split(',').includes(t));

  if (!state.property) return null;

  const showErrors = state.property.errors.length > 0;
  const errors = showErrors ? state.property.errors : state.property.lastErrors;
  const errorToShow = showErrors ? errors[state.property.currentErrorIndex % errors.length] : undefined;
  const cycleError = showErrors ? () => state.property.currentErrorIndex++ : undefined;

  return (
    <Grid templateColumns="1fr" gap="10">
      <FormControl position="relative">
        {state.properties.has('topics.regex') && (
          <Checkbox
            isChecked={state.isRegex}
            onChange={(e) => state.setSelectedProp(e.target.checked ? 'topics.regex' : 'topics')}
          >
            Use regular expressions
          </Checkbox>
        )}

        <FormHelperText mb={15}>
          <ExpandableText maxChars={60}>{state.property.entry.definition.documentation}</ExpandableText>
        </FormHelperText>

        {/* A 'source' connector imports data into the cluster. So we let the user choose the name of the topic directly  */}
        {state.isRegex || p.connectorType === 'source' ? (
          <Input
            value={String(state.property.value)}
            onChange={(e) => (state.property.value = e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        ) : (
          <Select
            isMulti
            options={allTopics.map((x) => ({ value: x, label: x }))}
            value={
              state.property.value
                ? state.property.value
                    ?.toString()
                    .split(',')
                    .map((val) => ({
                      value: val,
                      label: val,
                    }))
                : []
            }
            onChange={(v) => {
              if (isMultiValue(v)) {
                state.property.value = v.map(({ value }) => value)?.join(',') ?? [];
              }
            }}
          />
        )}

        {showErrors && <FormErrorMessage onClick={cycleError}>{errorToShow}</FormErrorMessage>}
      </FormControl>

      {/* <Box p="4" >
                <h2>Matching Topics</h2>

            </Box> */}
    </Grid>
  );
});
