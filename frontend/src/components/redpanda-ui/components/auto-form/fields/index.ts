import {
  booleanFieldDefinition,
  checkboxFieldDefinition,
  switchFieldDefinition,
  ToggleFieldComponent,
} from './boolean';
import { bytesFieldDefinition } from './bytes';
import { choiceboxFieldDefinition } from './choicebox';
import { comboboxFieldDefinition } from './combobox';
import { currencyFieldDefinition } from './currency';
import { dateFieldDefinition, timestampFieldDefinition } from './date';
import { durationFieldDefinition } from './duration';
import { emailFieldDefinition } from './email';
import { MissingFieldComponent } from './fallback';
import { fieldMaskFieldDefinition } from './field-mask';
import { int64FieldDefinition } from './int64';
import { jsonFieldDefinition } from './json';
import { keyValueFieldDefinition } from './key-value';
import { dataProviderMultiselectFieldDefinition, multiselectFieldDefinition } from './multiselect';
import { numberFieldDefinition } from './number';
import { passwordFieldDefinition } from './password';
import { radioFieldDefinition } from './radio';
import { secretSelectorFieldDefinition } from './secret-selector';
import { dataProviderSelectFieldDefinition, selectFieldDefinition } from './select';
import { sliderFieldDefinition } from './slider';
import { stringFieldDefinition } from './string';
import { textareaFieldDefinition } from './textarea';
import { toggleGroupFieldDefinition } from './toggle-group';
import { urlFieldDefinition } from './url';
import type { AutoFormFieldComponents } from '../core-types';
import { FieldTypeRegistry } from '../registry';

// ---------------------------------------------------------------------------
// Default registry with all built-in field types
// ---------------------------------------------------------------------------

export const defaultRegistry = new FieldTypeRegistry()
  // Data-provider-annotated fields win over every default matcher — the
  // annotation is an explicit instruction from proto, overriding the
  // string/email/etc. fallbacks.
  .register(dataProviderSelectFieldDefinition)
  // String-family (higher priority first so they match before the generic string)
  .register(secretSelectorFieldDefinition)
  .register(passwordFieldDefinition)
  .register(emailFieldDefinition)
  .register(urlFieldDefinition)
  .register(currencyFieldDefinition)
  .register(textareaFieldDefinition)
  .register(stringFieldDefinition)

  // Number-family
  .register(sliderFieldDefinition)
  .register(numberFieldDefinition)

  // Int64
  .register(int64FieldDefinition)

  // Boolean-family
  .register(booleanFieldDefinition)
  .register(checkboxFieldDefinition)
  .register(switchFieldDefinition)

  // Date-family
  .register(dateFieldDefinition)
  .register(timestampFieldDefinition)

  // Select-family
  .register(choiceboxFieldDefinition)
  .register(toggleGroupFieldDefinition)
  .register(comboboxFieldDefinition)
  .register(radioFieldDefinition)
  .register(selectFieldDefinition)

  // Array / map
  .register(dataProviderMultiselectFieldDefinition)
  .register(multiselectFieldDefinition)
  .register(keyValueFieldDefinition)

  // Protobuf-specific
  .register(bytesFieldDefinition)
  .register(durationFieldDefinition)
  .register(fieldMaskFieldDefinition)
  .register(jsonFieldDefinition);

// ---------------------------------------------------------------------------
// Legacy map-based registry for backwards compatibility during migration
// ---------------------------------------------------------------------------

export const AutoFormFieldComponentRegistry = {
  string: stringFieldDefinition.component,
  textarea: textareaFieldDefinition.component,
  password: passwordFieldDefinition.component,
  secretSelector: secretSelectorFieldDefinition.component,
  email: emailFieldDefinition.component,
  url: urlFieldDefinition.component,
  currency: currencyFieldDefinition.component,
  number: numberFieldDefinition.component,
  slider: sliderFieldDefinition.component,
  int64: int64FieldDefinition.component,
  boolean: booleanFieldDefinition.component,
  checkbox: checkboxFieldDefinition.component,
  switch: switchFieldDefinition.component,
  toggle: ToggleFieldComponent,
  date: dateFieldDefinition.component,
  timestamp: timestampFieldDefinition.component,
  select: selectFieldDefinition.component,
  // Share the same component with `select` — the routing rule is
  // different (data-provider annotation vs proto enum), but the
  // component handles both via its internal provider branch.
  dataProviderSelect: dataProviderSelectFieldDefinition.component,
  radio: radioFieldDefinition.component,
  combobox: comboboxFieldDefinition.component,
  choicebox: choiceboxFieldDefinition.component,
  toggleGroup: toggleGroupFieldDefinition.component,
  multiselect: multiselectFieldDefinition.component,
  dataProviderMultiSelect: dataProviderMultiselectFieldDefinition.component,
  bytes: bytesFieldDefinition.component,
  duration: durationFieldDefinition.component,
  fieldMask: fieldMaskFieldDefinition.component,
  json: jsonFieldDefinition.component,
  keyValue: keyValueFieldDefinition.component,
  fallback: MissingFieldComponent,
} satisfies AutoFormFieldComponents;

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { MissingFieldComponent } from './fallback';

export {
  booleanFieldDefinition,
  bytesFieldDefinition,
  checkboxFieldDefinition,
  choiceboxFieldDefinition,
  comboboxFieldDefinition,
  currencyFieldDefinition,
  dataProviderMultiselectFieldDefinition,
  dataProviderSelectFieldDefinition,
  dateFieldDefinition,
  durationFieldDefinition,
  emailFieldDefinition,
  fieldMaskFieldDefinition,
  int64FieldDefinition,
  jsonFieldDefinition,
  keyValueFieldDefinition,
  multiselectFieldDefinition,
  numberFieldDefinition,
  passwordFieldDefinition,
  radioFieldDefinition,
  secretSelectorFieldDefinition,
  selectFieldDefinition,
  sliderFieldDefinition,
  stringFieldDefinition,
  switchFieldDefinition,
  textareaFieldDefinition,
  timestampFieldDefinition,
  toggleGroupFieldDefinition,
  urlFieldDefinition,
};
