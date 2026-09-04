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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
export const PropertyComponent = (props: { property: Property }) => {
  const p = props.property;
  const def = p.entry.definition;
  const metadata = p.entry.metadata;
  if (p.isHidden) {
    return null;
  }
  if (p.entry.value.visible === false) {
    return null;
  }

  let inputComp = (
    <div key={p.name}>
      <div>
        "{p.name}" (unknown type "{def.type}")
      </div>
      <div className="codeBox" style={{ fontSize: 'smaller' }}>
        {JSON.stringify(p.entry, undefined, 4)}
      </div>
    </div>
  );

  const v = p.value;

  switch (def.type) {
    case 'STRING':
    case 'CLASS': {
      const recValues = p.entry.value.recommended_values;
      if (metadata?.component_type === 'RADIO_GROUP') {
        const options =
          metadata.recommended_values && metadata.recommended_values?.length > 0
            ? metadata.recommended_values.map(({ value, display_name: label }) => ({ value, label }))
            : recValues.map((recValue) => ({ value: recValue, label: String(recValue).toUpperCase() }));
        inputComp = (
          <RadioGroup
            className="flex flex-wrap gap-4"
            name={p.name}
            onValueChange={(next) => {
              updatePropertyValue(p, next as Property['value']);
            }}
            orientation="horizontal"
            value={String(v || def.default_value)}
          >
            {options.map((option) => {
              const id = `${p.name}-${option.value}`;
              return (
                <div className="flex items-center gap-2" key={String(option.value)}>
                  <RadioGroupItem id={id} value={String(option.value)} />
                  <Label className="cursor-pointer" htmlFor={id}>
                    {option.label}
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        );
        break;
      }

      if (recValues?.length) {
        // Enum (recommended_values)
        const options = recValues.map((x: string) => ({ label: x, value: x }));
        inputComp = (
          <div className="max-w-[260px]">
            <SingleSelect
              onChange={(e) => {
                updatePropertyValue(p, e);
              }}
              options={options}
              value={v}
            />
          </div>
        );
      } else {
        // Input
        inputComp = (
          <Input
            defaultValue={def.default_value ?? undefined}
            disabled={props.property.isDisabled}
            onChange={(e) => {
              updatePropertyValue(p, e.target.value);
            }}
            spellCheck={false}
            value={String(v)}
          />
        );
      }
      break;
    }

    case 'PASSWORD':
      inputComp = (
        <SecretInput
          onChange={(e) => {
            updatePropertyValue(p, e);
          }}
          updating={p.crud === 'update'}
          value={String(v ?? '')}
        />
      );
      break;
    case 'INT':
    case 'LONG':
    case 'SHORT':
    case 'DOUBLE':
    case 'FLOAT':
      inputComp = (
        // Chakra's NumberInput emitted a number; a native number input emits a string, so coerce
        // here or the config would carry `"3"` where the connector expects `3`.
        <Input
          onChange={(e) => {
            updatePropertyValue(p, e.target.valueAsNumber);
          }}
          type="number"
          value={Number.isNaN(Number(v)) ? '' : Number(v)}
        />
      );
      break;

    case 'BOOLEAN':
      inputComp = (
        <Switch
          checked={Boolean(v)}
          onCheckedChange={(checked) => {
            updatePropertyValue(p, checked);
          }}
        />
      );
      break;

    case 'LIST':
      if (p.name === 'transforms') {
        inputComp = (
          <CommaSeparatedStringList
            defaultValue={String(v)}
            onChange={(x) => {
              updatePropertyValue(p, x);
            }}
          />
        );
      } else {
        inputComp = (
          <Input
            defaultValue={def.default_value ?? undefined}
            onChange={(e) => {
              updatePropertyValue(p, e.target.value);
            }}
            value={String(v)}
          />
        );
      }

      break;
    default:
      inputComp = (
        <Input
          defaultValue={def.default_value ?? undefined}
          onChange={(e) => {
            updatePropertyValue(p, e.target.value);
          }}
          value={String(v)}
        />
      );
      break;
  }

  inputComp = <ErrorWrapper input={inputComp} property={p} />;
  // Wrap name and input element
  return (
    <div className={`mt-6 ${inputSizeToClass[def.width]}`} data-testid={`property-${p.name}`}>
      {inputComp}
    </div>
  );
};

const inputSizeToClass = {
  [PropertyWidth.None]: 'none',
  [PropertyWidth.Short]: 'short',
  [PropertyWidth.Medium]: 'medium',
  [PropertyWidth.Long]: 'long',
} as const;
