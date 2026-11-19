'use client';

import { Trash2 } from 'lucide-react';
import { Badge } from '../badge';
import { Button } from '../button';
import { Label } from '../label';
import { requireDefined } from '../../lib/utils/require-defined';
import { jsonControlId } from './control-id';
import { JSONEditor } from './json-editor';
import {
  generateExampleData,
  getArrayItemDefault,
  isJSONObject,
  isSimpleObject,
  serializeJSONValue,
} from './json-field-values';
import { JSONBooleanField, JSONNumberField, JSONStringField, TypeMismatch } from './json-form-controls';
import { useJSONArrayIdentity } from './json-form-identity';
import type { JSONFormFieldProps } from './json-form-types';
import { type JSONSchemaType, type JSONValue, parseJSONValue } from './json-value';

const TRAILING_S_REGEX = /s$/;

function JSONValueEditor({ schema, value, path, settings }: JSONFormFieldProps) {
  return (
    <JSONEditor
      error={settings.error}
      onChange={(newValue) => {
        try {
          const parsed = parseJSONValue(newValue);
          settings.onError(undefined);
          settings.onFieldChange(path, parsed);
        } catch (error) {
          settings.onError(error instanceof Error ? error.message : 'Invalid JSON');
        }
      }}
      placeholder={JSON.stringify(generateExampleData(schema), null, 2)}
      value={serializeJSONValue(value)}
    />
  );
}

function schemaTypeLabel(schema: JSONSchemaType) {
  return schema.type ?? 'unknown';
}

function JSONObjectField(field: JSONFormFieldProps) {
  const { schema, value, path, depth, settings } = field;
  if (value !== null && value !== undefined && !isJSONObject(value)) {
    return <TypeMismatch path={path} type="object" />;
  }
  if (schema.properties === undefined) {
    return <JSONValueEditor {...field} />;
  }
  const object = isJSONObject(value) ? value : {};
  const requiredProperties = new Set(schema.required);
  return (
    <div className="space-y-2 p-3">
      {Object.entries(schema.properties).map(([key, subSchema]) => (
        <div key={key}>
          <div className="mb-1 flex items-center gap-2">
            <Label htmlFor={jsonControlId(settings.fieldId, [...path, key])} variant="strong">
              {key}
              {requiredProperties.has(key) && <span className="ml-1 text-destructive">*</span>}
            </Label>
            <Badge variant="outline">{schemaTypeLabel(subSchema)}</Badge>
          </div>
          <JSONFormField
            {...field}
            depth={depth + 1}
            optionKey={`${field.optionKey}/properties/${encodeURIComponent(key)}`}
            parentSchema={schema}
            path={[...path, key]}
            propertyName={key}
            schema={subSchema}
            value={object[key]}
          />
        </div>
      ))}
    </div>
  );
}

function arrayItemName(schema: JSONSchemaType, propertyName: string | undefined, fallback = 'Item'): string {
  const candidates = [schema.title, schema.description, propertyName?.replace(TRAILING_S_REGEX, '')];
  return candidates.find((candidate) => candidate !== undefined && candidate !== '') ?? fallback;
}

function ArrayItemFields({ field, item, index }: { field: JSONFormFieldProps; item: JSONValue; index: number }) {
  const { schema, path, depth, settings } = field;
  const itemPath = [...path, index.toString()];
  if (schema.type !== 'object' || schema.properties === undefined) {
    return (
      <JSONFormField
        {...field}
        depth={depth + 1}
        parentSchema={undefined}
        path={itemPath}
        propertyName={undefined}
        value={item}
      />
    );
  }
  const requiredProperties = new Set(schema.required);
  return Object.entries(schema.properties).map(([key, subSchema]) => (
    <div className="space-y-1" key={key}>
      <div className="flex items-center gap-2">
        <Label htmlFor={jsonControlId(settings.fieldId, [...itemPath, key])} variant="strong">
          {key}
        </Label>
        <Badge variant="outline">{schemaTypeLabel(subSchema)}</Badge>
        {requiredProperties.has(key) && <span className="ml-1 text-destructive">*</span>}
      </div>
      <JSONFormField
        {...field}
        depth={depth + 1}
        optionKey={`${field.optionKey}/properties/${encodeURIComponent(key)}`}
        parentSchema={schema}
        path={[...itemPath, key]}
        propertyName={key}
        schema={subSchema}
        value={isJSONObject(item) ? item[key] : undefined}
      />
    </div>
  ));
}

function JSONArrayField(field: JSONFormFieldProps) {
  const { schema, value, path, propertyName, settings } = field;
  const array: JSONValue[] = Array.isArray(value) ? value : [];
  const identity = useJSONArrayIdentity(array.length, settings.document);
  if (value !== null && value !== undefined && !Array.isArray(value)) {
    return <TypeMismatch path={path} type="array" />;
  }
  const itemSchema = schema.items;
  if (itemSchema === undefined) {
    return null;
  }
  if (!isSimpleObject(itemSchema)) {
    return <JSONValueEditor {...field} />;
  }
  const name = arrayItemName(itemSchema, propertyName);
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <div className="space-y-4">
      {schema.description !== undefined && schema.description !== '' ? (
        <div className="text-body-sm text-subtle">{schema.description}</div>
      ) : null}
      <div className="space-y-4">
        {array.map((item, index) => (
          <div
            className="rounded-lg border border-border bg-card p-4"
            key={requireDefined(identity.rowIds[index], 'Expected an accepted JSON array row.')}
          >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-heading-xs">
                {displayName} #{index + 1}
              </h4>
              <Button
                aria-label={`Remove ${arrayItemName(itemSchema, propertyName, 'item')} ${index + 1}`}
                onClick={() => {
                  const nextArray = [...array];
                  nextArray.splice(index, 1);
                  const change = settings.onFieldChange(path, nextArray);
                  if (change !== undefined) {
                    identity.proposeRemoval(change, index);
                  }
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <ArrayItemFields
                field={{ ...field, schema: itemSchema, optionKey: `${field.optionKey}/items` }}
                index={index}
                item={item}
              />
            </div>
          </div>
        ))}
        <Button
          className="w-full"
          onClick={() => {
            const change = settings.onFieldChange(path, [...array, getArrayItemDefault(itemSchema)]);
            if (change !== undefined) {
              identity.proposeInsertion(change);
            }
          }}
          size="sm"
          type="button"
          variant="primary-dashed"
        >
          + Add {name}
        </Button>
      </div>
    </div>
  );
}

export function JSONFormField(field: JSONFormFieldProps) {
  const { schema, depth, settings } = field;
  if (depth >= settings.maxDepth && (schema.type === 'object' || schema.type === 'array')) {
    return <JSONValueEditor {...field} />;
  }
  const type = Array.isArray(schema.type)
    ? (schema.type.find((candidate) => candidate !== 'null') ?? schema.type[0])
    : schema.type;
  switch (type) {
    case 'string':
      return <JSONStringField {...field} />;
    case 'number':
      return <JSONNumberField {...field} />;
    case 'integer':
      return <JSONNumberField {...field} integer />;
    case 'boolean':
      return <JSONBooleanField {...field} />;
    case 'object':
      return <JSONObjectField {...field} />;
    case 'array':
      return <JSONArrayField {...field} />;
    case 'null':
    case undefined:
      return null;
    default:
      throw new TypeError('Unsupported JSON schema field type.');
  }
}
