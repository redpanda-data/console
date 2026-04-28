import type React from 'react';

import type { AutoFormFieldProps, ParsedField } from './core-types';
import { getLabel } from './field-utils';
import { getProtoFieldCustomData } from './proto';

export type FieldTypeDefinition = {
  name: string;
  match: (field: ParsedField, context: FieldMatchContext) => boolean;
  priority: number;
  component: React.ComponentType<AutoFormFieldProps>;
};

export type FieldMatchContext = {
  identity: string; // `${field.key} ${label}`.toLowerCase()
  inputType: string;
  maxLength: number;
};

export class FieldTypeRegistry {
  private definitions: FieldTypeDefinition[] = [];

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
  const label = String(field.fieldConfig?.label ?? getLabel(field));
  const identity = `${field.key} ${label}`.toLowerCase();
  const inputType = String(field.fieldConfig?.inputProps?.type ?? getProtoFieldCustomData(field)?.inputType ?? '');
  const maxLength = Number(field.fieldConfig?.inputProps?.maxLength ?? 0);
  return { identity, inputType, maxLength };
}
