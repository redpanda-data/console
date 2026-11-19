import type { ComboboxOption } from '../combobox';
import type { JSONDocumentChange } from './json-form-identity';
import type { CustomFieldConfig, JSONSchemaType, JSONValue } from './json-value';

export interface JSONOptionStore {
  byKey: ReadonlyMap<string, ComboboxOption[]>;
  create: (key: string, value: string) => void;
}

export interface JSONFormSettings {
  customFields: CustomFieldConfig[];
  document: JSONValue;
  error: string | undefined;
  fieldId: string;
  maxDepth: number;
  onError: (error: string | undefined) => void;
  onFieldChange: (path: string[], value: JSONValue) => JSONDocumentChange | undefined;
  options: JSONOptionStore;
}

export interface JSONFormFieldProps {
  depth: number;
  optionKey: string;
  parentSchema?: JSONSchemaType | undefined;
  path: string[];
  propertyName?: string | undefined;
  schema: JSONSchemaType;
  settings: JSONFormSettings;
  value: JSONValue;
}
