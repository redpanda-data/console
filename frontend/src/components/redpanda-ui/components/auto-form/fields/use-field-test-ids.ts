'use client';

// Copyright 2026 Redpanda Data, Inc.

import { useAutoForm } from '../context';
import { getAutoFormChoiceTestId, getAutoFormFieldTestId } from '../test-ids';

export function useFieldTestIds(id: string) {
  const { testIdPrefix } = useAutoForm();

  return {
    control: getAutoFormFieldTestId(testIdPrefix, id, 'control'),
    controlPart: (part: string) => getAutoFormFieldTestId(testIdPrefix, id, `control-${part}`),
    field: getAutoFormFieldTestId(testIdPrefix, id),
    group: (group: string | number) => getAutoFormChoiceTestId(testIdPrefix, id, 'group', group),
    option: (value: string | number) => getAutoFormChoiceTestId(testIdPrefix, id, 'option', value),
    selected: (value: string | number) => getAutoFormChoiceTestId(testIdPrefix, id, 'selected', value),
  };
}
