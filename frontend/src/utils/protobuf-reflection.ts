/**
 * Copyright 2024 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { type DescMessage, getOption } from '@bufbuild/protobuf';
import { FieldBehavior, field_behavior } from '../protogen/google/api/field_behavior_pb';

/**
 * Get the field behaviors for a specific field in a message schema
 * @param messageSchema The message schema descriptor
 * @param fieldName The name of the field to check
 * @returns Array of field behaviors, or empty array if none found
 */
export function getFieldBehaviors(messageSchema: DescMessage, fieldName: string): FieldBehavior[] {
  try {
    const field = messageSchema.fields.find((f) => f.name === fieldName);
    if (!field) {
      console.warn(`Field '${fieldName}' not found in message schema '${messageSchema.name}'`);
      return [];
    }

    const behaviors = getOption(field, field_behavior);
    return behaviors || [];
  } catch (error) {
    console.warn(`Failed to get field behaviors for '${fieldName}':`, error);
    return [];
  }
}

/**
 * Check if a field is marked as IMMUTABLE
 * @param messageSchema The message schema descriptor
 * @param fieldName The name of the field to check
 * @returns true if the field is immutable
 */
export function isFieldImmutable(messageSchema: DescMessage, fieldName: string): boolean {
  const behaviors = getFieldBehaviors(messageSchema, fieldName);
  return behaviors.includes(FieldBehavior.IMMUTABLE);
}

/**
 * Check if a field is marked as OUTPUT_ONLY
 * @param messageSchema The message schema descriptor
 * @param fieldName The name of the field to check
 * @returns true if the field is output only
 */
export function isFieldOutputOnly(messageSchema: DescMessage, fieldName: string): boolean {
  const behaviors = getFieldBehaviors(messageSchema, fieldName);
  return behaviors.includes(FieldBehavior.OUTPUT_ONLY);
}

/**
 * Check if a field is marked as REQUIRED
 * @param messageSchema The message schema descriptor
 * @param fieldName The name of the field to check
 * @returns true if the field is required
 */
export function isFieldRequired(messageSchema: DescMessage, fieldName: string): boolean {
  const behaviors = getFieldBehaviors(messageSchema, fieldName);
  return behaviors.includes(FieldBehavior.REQUIRED);
}

/**
 * Check if a field is editable (not immutable and not output only)
 * @param messageSchema The message schema descriptor
 * @param fieldName The name of the field to check
 * @returns true if the field can be edited
 */
export function isFieldEditable(messageSchema: DescMessage, fieldName: string): boolean {
  return !isFieldImmutable(messageSchema, fieldName) && !isFieldOutputOnly(messageSchema, fieldName);
}

/**
 * Get all field metadata for a message
 * @param messageSchema The message schema descriptor
 * @returns Object mapping field names to their metadata
 */
export function getMessageFieldMetadata(messageSchema: DescMessage): Record<
  string,
  {
    name: string;
    isRequired: boolean;
    isImmutable: boolean;
    isOutputOnly: boolean;
    isEditable: boolean;
    behaviors: FieldBehavior[];
  }
> {
  const metadata: Record<string, any> = {};

  for (const field of messageSchema.fields) {
    const behaviors = getFieldBehaviors(messageSchema, field.name);
    metadata[field.name] = {
      name: field.name,
      isRequired: behaviors.includes(FieldBehavior.REQUIRED),
      isImmutable: behaviors.includes(FieldBehavior.IMMUTABLE),
      isOutputOnly: behaviors.includes(FieldBehavior.OUTPUT_ONLY),
      isEditable: !behaviors.includes(FieldBehavior.IMMUTABLE) && !behaviors.includes(FieldBehavior.OUTPUT_ONLY),
      behaviors,
    };
  }

  return metadata;
}

/**
 * Debug helper to log all field behaviors for a message
 * @param messageSchema The message schema descriptor
 */
export function debugFieldBehaviors(messageSchema: DescMessage): void {
  const metadata = getMessageFieldMetadata(messageSchema);

  for (const [, meta] of Object.entries(metadata)) {
    const flags = [];
    if (meta.isRequired) flags.push('REQUIRED');
    if (meta.isImmutable) flags.push('IMMUTABLE');
    if (meta.isOutputOnly) flags.push('OUTPUT_ONLY');
  }
}
