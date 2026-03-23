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
import { useMemo, useState } from 'react';

import { useTopicsQuery } from '../../../../../react-query/api/topic';
import type { Property } from '../../../../../state/connect/state';
import { ExpandableText } from '../../../../misc/expandable-text';

const setPropertyValue = (property: Property, value: Property['value']) => {
  property.value = value;
};

const incrementErrorIndex = (property: Property) => {
  property.currentErrorIndex += 1;
};

export const TopicInput = (p: { properties: Property[]; connectorType: 'sink' | 'source' }) => {
  const propsMap = useMemo(() => new Map(p.properties.map((prop) => [prop.name, prop])), [p.properties]);
  const topicsRegex = p.properties.find((x) => x.name === 'topics.regex');
  const initialSelection = topicsRegex?.value ? 'topics.regex' : 'topics';

  const [selected, setSelected] = useState(initialSelection);

  const { data: topicsData } = useTopicsQuery();

  const property = propsMap.get(selected);
  const isRegex = selected === 'topics.regex';

  if (!property) {
    return null;
  }

  const showErrors = property.errors.length > 0;
  const errors = showErrors ? property.errors : property.lastErrors;
  const errorToShow = showErrors ? errors[property.currentErrorIndex % errors.length] : undefined;
  const cycleError = showErrors
    ? () => {
        incrementErrorIndex(property);
      }
    : undefined;

  return (
    <Grid gap="10" templateColumns="1fr">
      <FormControl position="relative">
        {propsMap.has('topics.regex') && (
          <Checkbox
            isChecked={isRegex}
            onChange={(e) => {
              setPropertyValue(property, '');
              setSelected(e.target.checked ? 'topics.regex' : 'topics');
            }}
          >
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
              setPropertyValue(property, e.target.value);
            }}
            spellCheck={false}
            value={String(property.value)}
          />
        ) : (
          <Select
            isMulti
            onChange={(v) => {
              if (isMultiValue(v)) {
                setPropertyValue(property, v.map(({ value }) => value)?.join(',') ?? []);
              }
            }}
            options={topicsData?.topics?.map((x) => ({ value: x.topicName, label: x.topicName })) ?? []}
            value={
              property.value
                ? property.value
                    ?.toString()
                    .split(',')
                    .map((val) => ({
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
