import type { CustomFieldConfig, JSONSchemaType, JSONValue } from './json-value';

const isTypeSupported = (type: JSONSchemaType['type'], supportedTypes: ReadonlySet<string>): boolean => {
  if (Array.isArray(type)) {
    return type.every((t) => supportedTypes.has(t));
  }
  return typeof type === 'string' && supportedTypes.has(type);
};

export const isSimpleObject = (schema: JSONSchemaType): boolean => {
  const supportedTypes = new Set(['string', 'number', 'integer', 'boolean', 'null']);
  if (schema.type !== undefined && isTypeSupported(schema.type, supportedTypes)) {
    return true;
  }
  if (schema.type === 'object') {
    return schema.properties !== undefined && Object.keys(schema.properties).length > 0;
  }
  if (schema.type === 'array') {
    return schema.items !== undefined;
  }
  return false;
};

export const getArrayItemDefault = (schema: JSONSchemaType): JSONValue => {
  if ('default' in schema && schema.default !== undefined) {
    return schema.default;
  }

  switch (schema.type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    case 'null':
    case undefined:
      return null;
    default:
      return null;
  }
};

export const generateExampleData = (schema: JSONSchemaType): JSONValue => {
  if ('default' in schema && schema.default !== undefined) {
    return schema.default;
  }

  switch (schema.type) {
    case 'string':
      return typeof schema.examples?.[0] === 'string' ? schema.examples[0] : '';
    case 'number':
    case 'integer':
      return typeof schema.examples?.[0] === 'number' ? schema.examples[0] : 42;
    case 'boolean':
      return true;
    case 'array':
      if (schema.items !== undefined) {
        return [generateExampleData(schema.items)];
      }
      return [];
    case 'object':
      if (schema.properties !== undefined) {
        const result: Record<string, JSONValue> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          result[key] = generateExampleData(propSchema);
        }
        return result;
      }
      return {};
    case 'null':
    case undefined:
      return null;
    default:
      return null;
  }
};

export function serializeJSONValue(value: JSONValue): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

export function isJSONObject(value: JSONValue | undefined): value is Record<string, JSONValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeJSONFieldNode(
  schema: JSONSchemaType,
  value: JSONValue | undefined,
  customFields: ReadonlyMap<string, CustomFieldConfig>
): JSONValue | undefined {
  if (!(schema.type === 'object' && schema.properties !== undefined)) {
    return value;
  }

  if (value !== null && value !== undefined && !isJSONObject(value)) {
    return value;
  }
  const source = isJSONObject(value) ? value : {};
  return normalizeObjectChildren(schema.properties, source, customFields);
}

function normalizeObjectChildren(
  properties: Record<string, JSONSchemaType>,
  source: Record<string, JSONValue>,
  customFields: ReadonlyMap<string, CustomFieldConfig>
) {
  let normalized = source;
  for (const [key, childSchema] of Object.entries(properties)) {
    const currentChild = source[key];
    const customField = customFields.get(key);
    const onlyOption = customField?.options.length === 1 ? customField.options[0] : undefined;
    const nextChild =
      onlyOption !== undefined && (currentChild === undefined || currentChild === null || currentChild === '')
        ? onlyOption.value
        : normalizeJSONFieldNode(childSchema, currentChild, customFields);
    if (nextChild !== undefined && nextChild !== currentChild) {
      normalized = normalized === source ? { ...source } : normalized;
      normalized[key] = nextChild;
    }
  }
  return normalized;
}

export function normalizeJSONFieldValue(
  schema: JSONSchemaType,
  value: JSONValue,
  customFields: CustomFieldConfig[]
): JSONValue {
  const customFieldsByName = new Map<string, CustomFieldConfig>();
  for (const field of customFields) {
    customFieldsByName.set(field.fieldName, field);
  }
  return normalizeJSONFieldNode(schema, value, customFieldsByName) ?? value;
}
