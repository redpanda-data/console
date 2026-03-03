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
import { useEffect, useState } from 'react';

import { api } from '../../../../../state/backend-api';
import type { Property } from '../../../../../state/connect/state';
import { ExpandableText } from '../../../../misc/expandable-text';

export const TopicInput = (p: { properties: Property[]; connectorType: 'sink' | 'source' }) => {
  const [properties] = useState(() => new Map(p.properties.map((prop) => [prop.name, prop])));

  const topicsRegex = p.properties.find((x) => x.name === 'topics.regex');
  const initialSelection = topicsRegex?.value ? 'topics.regex' : 'topics';
  const [selected, setSelected] = useState(initialSelection);
  const [localValue, setLocalValue] = useState(() => String(properties.get(initialSelection)?.value ?? ''));

  useEffect(() => {
    api.refreshTopics();
  }, []);

  const property = properties.get(selected);
  const isRegex = selected === 'topics.regex';

  const setSelectedProp = (input: string) => {
    const currentProp = properties.get(selected);
    if (currentProp) currentProp.value = '';
    setSelected(input);
    setLocalValue('');
  };

  if (!property) {
    return null;
  }

  const showErrors = property.errors.length > 0;
  const errors = showErrors ? property.errors : property.lastErrors;
  const errorToShow = showErrors ? errors[property.currentErrorIndex % errors.length] : undefined;
  const cycleError = showErrors
    ? () => {
        property.currentErrorIndex += 1;
      }
    : undefined;

  return (
    <Grid gap="10" templateColumns="1fr">
      <FormControl position="relative">
        {properties.has('topics.regex') && (
          <Checkbox isChecked={isRegex} onChange={(e) => setSelectedProp(e.target.checked ? 'topics.regex' : 'topics')}>
            Use regular expressions
          </Checkbox>
        )}

        <FormHelperText mb={15}>
          <ExpandableText maxChars={60}>{property.entry.definition.documentation}</ExpandableText>
        </FormHelperText>

        {/* A 'source' connector imports data into the cluster. So we let the user choose the name of the topic directly  */}
        {isRegex || p.connectorType === 'source' ? (
          <Input
            autoComplete="off"
            onChange={(e) => {
              setLocalValue(e.target.value);
              property.value = e.target.value;
            }}
            spellCheck={false}
            value={localValue}
          />
        ) : (
          <Select
            isMulti
            onChange={(v) => {
              if (isMultiValue(v)) {
                const joined = v.map(({ value }) => value).join(',');
                setLocalValue(joined);
                property.value = joined;
              }
            }}
            options={api.topics?.map((x) => ({ value: x.topicName, label: x.topicName })) ?? []}
            value={
              localValue
                ? localValue.split(',').map((val) => ({
                    value: val,
                    label: val,
                  }))
                : []
            }
          />
        )}

        {Boolean(showErrors) && <FormErrorMessage onClick={cycleError}>{errorToShow}</FormErrorMessage>}
      </FormControl>

      {/* <Box p="4" >
                <h2>Matching Topics</h2>

            </Box> */}
    </Grid>
  );
};
