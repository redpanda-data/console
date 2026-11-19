// Copyright 2026 Redpanda Data, Inc.

import {
  CONSENT_FIELD_PATTERN,
  CURRENCY_FIELD_PATTERN,
  EMAIL_FIELD_PATTERN,
  LONG_TEXT_FIELD_PATTERN,
  SECRET_FIELD_PATTERN,
  URL_FIELD_PATTERN,
} from '../helpers';
// Matching metadata is separate from render modules so field components retain Fast Refresh.
import type { FieldTypeDefinition } from '../registry';
import { getFieldUiConfig } from '../ui-config';
import { BooleanFieldComponent, CheckboxFieldComponent, SwitchFieldComponent } from './boolean';
import { BytesFieldComponent } from './bytes';
import { ComboboxFieldComponent } from './combobox';
import { CurrencyFieldComponent } from './currency';
import { DateFieldComponent, TimestampFieldComponent } from './date';
import { DurationFieldComponent } from './duration';
import { EmailFieldComponent } from './email';
import { FieldMaskFieldComponent } from './field-mask';
import { readDataProviderId } from './field-values';
import { Int64FieldComponent } from './int64';
import { JsonFieldComponent } from './json';
import { KeyValueFieldComponent } from './key-value';
import { DataProviderMultiSelectComponent, MultiSelectFieldComponent } from './multiselect';
import { NumberFieldComponent } from './number';
import { PasswordFieldComponent } from './password';
import { RadioFieldComponent } from './radio';
import { SecretSelectorFieldComponent } from './secret-selector';
import { SelectFieldComponent } from './select';
import { SliderFieldComponent } from './slider';
import { StringFieldComponent } from './string';
import { TextareaFieldComponent } from './textarea';
import { ToggleGroupFieldComponent } from './toggle-group';
import { UrlFieldComponent } from './url';

export const booleanFieldDefinition: FieldTypeDefinition = {
  name: 'boolean',
  priority: 15,
  match: (field) => {
    if (field.type !== 'boolean') {
      return false;
    }
    return getFieldUiConfig(field).supportsUnset === true && !field.required;
  },
  component: BooleanFieldComponent,
};

export const checkboxFieldDefinition: FieldTypeDefinition = {
  name: 'checkbox',
  priority: 14,
  match: (field, context) => field.type === 'boolean' && CONSENT_FIELD_PATTERN.test(context.identity),
  component: CheckboxFieldComponent,
};

export const switchFieldDefinition: FieldTypeDefinition = {
  name: 'switch',
  priority: 10,
  match: (field) => field.type === 'boolean',
  component: SwitchFieldComponent,
};

export const bytesFieldDefinition: FieldTypeDefinition = {
  name: 'bytes',
  priority: 10,
  match: (field) => field.type === 'bytes',
  component: BytesFieldComponent,
};

export const comboboxFieldDefinition: FieldTypeDefinition = {
  name: 'combobox',
  priority: 18,
  match: (field) => {
    if (field.type !== 'select') {
      return false;
    }
    const optionCount = field.options?.length ?? 0;
    return optionCount > 8;
  },
  component: ComboboxFieldComponent,
};

export const currencyFieldDefinition: FieldTypeDefinition = {
  name: 'currency',
  priority: 18,
  match: (field, context) => field.type === 'string' && CURRENCY_FIELD_PATTERN.test(context.identity),
  component: CurrencyFieldComponent,
};

export const dateFieldDefinition: FieldTypeDefinition = {
  name: 'date',
  priority: 10,
  match: (field) => field.type === 'date',
  component: DateFieldComponent,
};

export const timestampFieldDefinition: FieldTypeDefinition = {
  name: 'timestamp',
  priority: 10,
  match: (field) => field.type === 'timestamp',
  component: TimestampFieldComponent,
};

export const durationFieldDefinition: FieldTypeDefinition = {
  name: 'duration',
  priority: 10,
  match: (field) => field.type === 'duration',
  component: DurationFieldComponent,
};

export const emailFieldDefinition: FieldTypeDefinition = {
  name: 'email',
  priority: 20,
  match: (field, context) =>
    field.type === 'string' && (context.inputType === 'email' || EMAIL_FIELD_PATTERN.test(context.identity)),
  component: EmailFieldComponent,
};

export const fieldMaskFieldDefinition: FieldTypeDefinition = {
  name: 'fieldMask',
  priority: 10,
  match: (field) => field.type === 'fieldMask',
  component: FieldMaskFieldComponent,
};

export const int64FieldDefinition: FieldTypeDefinition = {
  name: 'int64',
  priority: 10,
  match: (field) => field.type === 'int64',
  component: Int64FieldComponent,
};

export const jsonFieldDefinition: FieldTypeDefinition = {
  name: 'json',
  priority: 10,
  match: (field) => field.type === 'json',
  component: JsonFieldComponent,
};

function isKeyValueScalarField(field: { type?: string } | undefined): boolean {
  if (field === undefined) {
    return false;
  }
  return ['string', 'email', 'url', 'password', 'currency', 'number', 'int64', 'select', 'combobox'].includes(
    field.type ?? ''
  );
}

function isSimpleKeyValueLikeObject(
  field: { type?: string; schema?: Array<{ key: string; type?: string }> } | undefined
): boolean {
  if (!(field?.type === 'object' && field.schema?.length === 2)) {
    return false;
  }

  const keyField = field.schema.find((candidate) => candidate.key === 'key');
  const valueField = field.schema.find((candidate) => candidate.key === 'value');
  return (
    keyField !== undefined &&
    valueField !== undefined &&
    isKeyValueScalarField(keyField) &&
    isKeyValueScalarField(valueField)
  );
}

export const keyValueFieldDefinition: FieldTypeDefinition = {
  name: 'keyValue',
  priority: 18,
  match: (field) => {
    if (field.type === 'array') {
      const itemField = field.schema?.[0];
      return isSimpleKeyValueLikeObject(itemField);
    }

    if (field.type === 'map') {
      const keyField = field.schema?.[0];
      const valueField = field.schema?.[1];
      return isKeyValueScalarField(keyField) && isKeyValueScalarField(valueField);
    }

    return false;
  },
  component: KeyValueFieldComponent,
};

export const multiselectFieldDefinition: FieldTypeDefinition = {
  name: 'multiselect',
  priority: 20,
  match: (field) => {
    if (field.type !== 'array') {
      return false;
    }
    const itemField = field.schema?.[0];
    return Boolean(itemField?.type === 'select' && itemField.options?.length);
  },
  component: MultiSelectFieldComponent,
};

export const dataProviderMultiselectFieldDefinition: FieldTypeDefinition = {
  name: 'dataProviderMultiSelect',
  // Higher than default `multiselect` (20) so an annotated item wins over the legacy branch.
  priority: 120,
  match: (field) => {
    if (field.type !== 'array') {
      return false;
    }
    const itemField = field.schema?.[0];
    if (itemField === undefined || (itemField.type !== 'string' && itemField.type !== 'number')) {
      return false;
    }
    return readDataProviderId(itemField) !== undefined;
  },
  component: DataProviderMultiSelectComponent,
};

export const numberFieldDefinition: FieldTypeDefinition = {
  name: 'number',
  priority: 10,
  match: (field) => {
    if (field.type !== 'number') {
      return false;
    }
    const min = Number(field.fieldConfig?.inputProps?.['min']);
    const max = Number(field.fieldConfig?.inputProps?.['max']);
    return !(Number.isFinite(min) && Number.isFinite(max));
  },
  component: NumberFieldComponent,
};

export const passwordFieldDefinition: FieldTypeDefinition = {
  name: 'password',
  priority: 20,
  match: (field, context) =>
    field.type === 'string' && (SECRET_FIELD_PATTERN.test(context.identity) || context.inputType === 'password'),
  component: PasswordFieldComponent,
};

export const radioFieldDefinition: FieldTypeDefinition = {
  name: 'radio',
  priority: 15,
  match: (field) => {
    if (field.type !== 'select') {
      return false;
    }
    const optionCount = field.options?.length ?? 0;
    return optionCount > 0 && optionCount <= 3;
  },
  component: RadioFieldComponent,
};

export const secretSelectorFieldDefinition: FieldTypeDefinition = {
  name: 'secretSelector',
  priority: 25,
  match: (_field, context) => context.inputType === 'secretSelector',
  component: SecretSelectorFieldComponent,
};

export const selectFieldDefinition: FieldTypeDefinition = {
  name: 'select',
  priority: 12,
  match: (field) => {
    if (field.type !== 'select') {
      return false;
    }
    const optionCount = field.options?.length ?? 0;
    return optionCount > 3 && optionCount <= 8;
  },
  component: SelectFieldComponent,
};

// Routes any `data_provider`-annotated field to SelectFieldComponent regardless
// of proto type. High priority so the annotation beats string/password/email matchers.
export const dataProviderSelectFieldDefinition: FieldTypeDefinition = {
  name: 'dataProviderSelect',
  priority: 120,
  match: (field) => {
    // Arrays/maps/objects keep their native renderers even when annotated.
    if (field.type !== 'string' && field.type !== 'number') {
      return false;
    }
    return readDataProviderId(field) !== undefined;
  },
  component: SelectFieldComponent,
};

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
    if (!(customData !== undefined && typeof customData === 'object')) {
      return false;
    }
    const bag = customData as { control?: unknown; ui?: { control?: unknown } };
    if (bag.control === 'slider') {
      return true;
    }
    if (bag.ui !== undefined && typeof bag.ui === 'object' && bag.ui.control === 'slider') {
      return true;
    }
    return false;
  },
  component: SliderFieldComponent,
};

export const stringFieldDefinition: FieldTypeDefinition = {
  name: 'string',
  priority: 10,
  match: (field) => field.type === 'string',
  component: StringFieldComponent,
};

export const textareaFieldDefinition: FieldTypeDefinition = {
  name: 'textarea',
  priority: 15,
  match: (field, context) =>
    field.type === 'string' &&
    (context.inputType === 'textarea' || context.maxLength > 120 || LONG_TEXT_FIELD_PATTERN.test(context.identity)),
  component: TextareaFieldComponent,
};

export const toggleGroupFieldDefinition: FieldTypeDefinition = {
  name: 'toggleGroup',
  priority: 25,
  match: (field) => {
    if (field.type !== 'select') {
      return false;
    }
    return getFieldUiConfig(field).control === 'toggleGroup';
  },
  component: ToggleGroupFieldComponent,
};

export const urlFieldDefinition: FieldTypeDefinition = {
  name: 'url',
  priority: 20,
  match: (field, context) =>
    field.type === 'string' && (context.inputType === 'url' || URL_FIELD_PATTERN.test(context.identity)),
  component: UrlFieldComponent,
};
