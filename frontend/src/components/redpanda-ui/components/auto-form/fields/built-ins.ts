import type { AutoFormFieldComponents } from '../core-types';
import { FieldTypeRegistry } from '../registry';
import { ToggleFieldComponent } from './boolean';
import {
  booleanFieldDefinition,
  bytesFieldDefinition,
  checkboxFieldDefinition,
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
} from './definitions';
import { MissingFieldComponent } from './fallback';

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

// Built-in renderers are merged with the caller's field overrides by AutoForm.
export const defaultFieldComponents = {
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
  // Same component as `select`; routing differs (data-provider annotation vs proto enum).
  dataProviderSelect: dataProviderSelectFieldDefinition.component,
  radio: radioFieldDefinition.component,
  combobox: comboboxFieldDefinition.component,
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
