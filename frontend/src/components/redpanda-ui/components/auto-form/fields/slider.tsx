'use client';

import React from 'react';

import { normalizeNumberValue, parseNumericProp, resolveNumericStep, useFieldTestIds } from './shared';
import { Input } from '../../input';
import { Slider } from '../../slider';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

// Track + companion numeric input bound to the same value: the track for
// coarse drags, the input for precise entry below a drag's resolution.
function SliderFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const min = parseNumericProp(inputProps.min) ?? 0;
  const max = parseNumericProp(inputProps.max) ?? 100;
  const value = normalizeNumberValue(inputProps.value) ?? min;
  const step = resolveNumericStep(inputProps, value);
  const clamped = Math.min(max, Math.max(min, value));

  // Seed form state with `min` on mount when value is undefined/null: otherwise
  // the track shows at min but the number input reads empty and value stays unset.
  const hasSeededRef = React.useRef(false);
  React.useEffect(() => {
    if (hasSeededRef.current) {
      return;
    }
    if (inputProps.value === undefined || inputProps.value === null) {
      hasSeededRef.current = true;
      inputProps.onValueChange(min);
    }
  }, [inputProps, min]);

  return (
    <div className="flex items-center gap-4" data-testid={testIds.control}>
      <Slider
        className="flex-1"
        disabled={inputProps.disabled}
        max={max}
        min={min}
        onValueChange={(nextValues) => inputProps.onValueChange(nextValues[0] ?? min)}
        step={step}
        testId={testIds.controlPart('slider')}
        value={[clamped]}
      />
      <Input
        aria-invalid={Boolean(error)}
        className={`w-24 ${error ? 'border-destructive' : ''}`}
        disabled={inputProps.disabled}
        id={id}
        inputMode="decimal"
        max={max}
        min={min}
        onBlur={inputProps.onBlur}
        onChange={(event) => {
          const nextValue = event.target.value;
          inputProps.onValueChange(nextValue === '' ? min : Number(nextValue));
        }}
        placeholder={getFieldUiConfig(field).placeholder}
        step={step}
        testId={testIds.controlPart('input')}
        type="number"
        value={inputProps.value ?? clamped}
      />
    </div>
  );
}

export { SliderFieldComponent };

export const sliderFieldDefinition: FieldTypeDefinition = {
  name: 'slider',
  priority: 15,
  // Opt-in only: requires `customData.ui.control === 'slider'`. Numeric
  // min/max alone must NOT promote to slider or it double-renders with the
  // plain number field.
  match: (field) => {
    if (field.type !== 'number') {
      return false;
    }
    const customData = field.fieldConfig?.customData;
    if (!(customData && typeof customData === 'object')) {
      return false;
    }
    const bag = customData as { control?: unknown; ui?: { control?: unknown } };
    if (bag.control === 'slider') {
      return true;
    }
    if (bag.ui && typeof bag.ui === 'object' && bag.ui.control === 'slider') {
      return true;
    }
    return false;
  },
  component: SliderFieldComponent,
};
