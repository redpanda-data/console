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

import clsx from 'clsx';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { RadioGroup, RadioGroupItem } from 'components/redpanda-ui/components/radio-group';
import { Switch } from 'components/redpanda-ui/components/switch';

import { ErrorWrapper } from './forms/error-wrapper';
import { SecretInput } from './forms/secret-input';
import { CommaSeparatedStringList } from './list';
import type { Property } from '../../../../state/connect/state';
import { PropertyWidth } from '../../../../state/rest-interfaces';
import { SingleSelect } from '../../../misc/select';

const updatePropertyValue = (property: Property, value: Property['value']) => {
  property.value = value;
  property.notifyChange();
};

function recommendedRadioOptions(p: Property) {
  const metadata = p.entry.metadata;
  const recValues = p.entry.value.recommended_values;
  return metadata?.recommended_values && metadata.recommended_values?.length > 0
    ? metadata.recommended_values.map(({ value, display_name: label }) => ({ value, label }))
    : recValues.map((recValue) => ({ value: recValue, label: String(recValue).toUpperCase() }));
}

function renderRadioGroupInput(p: Property, fieldId: string) {
  const def = p.entry.definition;
  return (
    <RadioGroup
      // A radiogroup div is not labelable; it takes its name from the label instead of htmlFor.
      aria-labelledby={`${fieldId}-label`}
      aria-required={def.required || undefined}
      name={p.name}
      onValueChange={(next) => {
        updatePropertyValue(p, next as Property['value']);
      }}
      orientation="horizontal"
      value={String(p.value || def.default_value)}
    >
      {recommendedRadioOptions(p).map((option) => {
        const id = `${p.name}-${option.value}`;
        return (
          <div className="flex items-center gap-2" key={String(option.value)}>
            <RadioGroupItem id={id} testId={`${option.value}_field`} value={String(option.value)} />
            <Label className="cursor-pointer" htmlFor={id}>
              {option.label}
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}

function renderStringInput(p: Property, fieldId: string) {
  const def = p.entry.definition;
  const recValues = p.entry.value.recommended_values;
  if (p.entry.metadata?.component_type === 'RADIO_GROUP') {
    return renderRadioGroupInput(p, fieldId);
  }

  if (recValues?.length) {
    // Enum (recommended_values)
    const options = recValues.map((x: string) => ({ label: x, value: x }));
    return (
      <div className="max-w-[260px]">
        <SingleSelect
          id={fieldId}
          onChange={(e) => {
            updatePropertyValue(p, e);
          }}
          options={options}
          value={p.value}
        />
      </div>
    );
  }

  // Input
  return (
    <Input
      defaultValue={def.default_value ?? undefined}
      disabled={p.isDisabled}
      id={fieldId}
      onChange={(e) => {
        updatePropertyValue(p, e.target.value);
      }}
      required={def.required}
      spellCheck={false}
      value={String(p.value)}
    />
  );
}

function renderTextInput(p: Property, fieldId: string) {
  const def = p.entry.definition;
  return (
    <Input
      defaultValue={def.default_value ?? undefined}
      id={fieldId}
      onChange={(e) => {
        updatePropertyValue(p, e.target.value);
      }}
      required={def.required}
      value={String(p.value)}
    />
  );
}

function renderPropertyInput(p: Property, fieldId: string) {
  const v = p.value;
  const isRequired = p.entry.definition.required;

  switch (p.entry.definition.type) {
    case 'STRING':
    case 'CLASS':
      return renderStringInput(p, fieldId);

    case 'PASSWORD':
      return (
        <SecretInput
          id={fieldId}
          onChange={(e) => {
            updatePropertyValue(p, e);
          }}
          required={isRequired}
          updating={p.crud === 'update'}
          value={String(v ?? '')}
        />
      );
    case 'INT':
    case 'LONG':
    case 'SHORT':
    case 'DOUBLE':
    case 'FLOAT':
      return (
        <Input
          id={fieldId}
          onChange={(e) => {
            // Store the string: getConfigObject sends p.value as-is and ===-compares it to default_value.
            updatePropertyValue(p, e.target.value);
          }}
          required={isRequired}
          // Registry Input coerces step with Number(); "any" would become NaN.
          showStepControls
          step={1}
          type="number"
          // Keep the input controlled with '' when the stored value is not numeric.
          value={Number.isNaN(Number(v)) ? '' : Number(v)}
        />
      );

    case 'BOOLEAN':
      return (
        <Switch
          aria-required={isRequired || undefined}
          checked={Boolean(v)}
          id={fieldId}
          onCheckedChange={(checked) => {
            updatePropertyValue(p, checked);
          }}
        />
      );

    case 'LIST':
      if (p.name === 'transforms') {
        return (
          <CommaSeparatedStringList
            defaultValue={String(v)}
            id={fieldId}
            onChange={(x) => {
              updatePropertyValue(p, x);
            }}
          />
        );
      }
      return renderTextInput(p, fieldId);
    default:
      return renderTextInput(p, fieldId);
  }
}

export const PropertyComponent = (props: { property: Property }) => {
  const p = props.property;
  if (p.isHidden) {
    return null;
  }
  if (p.entry.value.visible === false) {
    return null;
  }

  // Field generates no ids; the label and the control share this one.
  const fieldId = `property-${p.name}`;

  // Wrap name and input element
  return (
    <div className={clsx('mt-6', inputSizeToClass[p.entry.definition.width])} data-testid={`property-${p.name}`}>
      <ErrorWrapper input={renderPropertyInput(p, fieldId)} inputId={fieldId} property={p} />
    </div>
  );
};

const inputSizeToClass = {
  [PropertyWidth.None]: 'none',
  [PropertyWidth.Short]: 'short',
  [PropertyWidth.Medium]: 'medium',
  [PropertyWidth.Long]: 'long',
} as const;
