import type React from 'react';
import { getProtoFieldCustomData } from '../../lib/protobuf-provider';
import type { AutoFormFieldProps, ParsedField } from './core-types';
import { getLabel, getRenderableText } from './field-utils';

export interface FieldTypeDefinition {
  component: React.ComponentType<AutoFormFieldProps>;
  match: (field: ParsedField, context: FieldMatchContext) => boolean;
  name: string;
  priority: number;
}

export interface FieldMatchContext {
  identity: string; // `${field.key} ${label}`.toLowerCase()
  inputType: string;
  maxLength: number;
}

export class FieldTypeRegistry {
  private readonly definitions: FieldTypeDefinition[] = [];

  register(definition: FieldTypeDefinition): this {
    this.definitions.push(definition);
    this.definitions.sort((a, b) => b.priority - a.priority);
    return this;
  }

  resolve(field: ParsedField, context: FieldMatchContext): FieldTypeDefinition | undefined {
    return this.definitions.find((def) => def.match(field, context));
  }

  list(): readonly FieldTypeDefinition[] {
    return this.definitions;
  }

  clone(): FieldTypeRegistry {
    const registry = new FieldTypeRegistry();
    for (const def of this.definitions) {
      registry.register(def);
    }
    return registry;
  }
}

export function buildFieldMatchContext(field: ParsedField): FieldMatchContext {
  const label = getRenderableText(getLabel(field), field.key);
  const identity = `${field.key} ${label}`.toLowerCase();
  const configuredType = field.fieldConfig?.inputProps?.['type'] ?? getProtoFieldCustomData(field)?.inputType;
  const inputType = typeof configuredType === 'string' ? configuredType : '';
  const configuredMaxLength = field.fieldConfig?.inputProps?.['maxLength'];
  const maxLength = typeof configuredMaxLength === 'number' ? configuredMaxLength : 0;
  return { identity, inputType, maxLength };
}
