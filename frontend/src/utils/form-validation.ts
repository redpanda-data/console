/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { DescMessage, Message } from '@bufbuild/protobuf';
import { createValidator } from '@bufbuild/protovalidate';
import type { FieldErrors, Resolver } from 'react-hook-form';

/**
 * Helper to set nested errors by path in React Hook Form error object
 */
function setNestedError(errors: Record<string, unknown>, path: string, error: unknown): void {
  const parts = path.split('.');
  let current = errors;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts.at(-1);
  if (lastPart) {
    current[lastPart] = error;
  }
}

/**
 * Custom validation result type
 */
export type ValidationResult = {
  valid: boolean;
  errors: Record<string, string>;
};

/**
 * Function to build a proto message from form values
 */
export type ProtoBuilder<TFormValues, TProto extends Message> = (values: TFormValues) => TProto;

/**
 * Custom validation function type
 */
export type CustomValidator<TFormValues> = (values: TFormValues) => ValidationResult;

/**
 * Creates a React Hook Form resolver that combines custom validation with proto validation
 *
 * This is the recommended approach for forms that use plain form values (not proto messages directly).
 * It provides real-time validation:
 * 1. Custom validation for form-level logic (runs on every change)
 * 2. Proto validation for schema constraints (runs on every change if protoBuilder provided)
 *
 * @param options - Configuration options
 * @param options.customValidator - Optional custom validation function for cross-field logic
 * @param options.protoBuilder - Optional function to build proto message from form values
 * @param options.protoSchema - Optional proto schema to validate against (required if protoBuilder provided)
 * @returns A React Hook Form resolver function
 *
 * @example
 * ```typescript
 * import { createFormResolver } from 'utils/form-validation';
 *
 * // Define custom validation
 * function validateMyForm(values: MyFormValues): ValidationResult {
 *   const errors: Record<string, string> = {};
 *   if (values.startDate > values.endDate) {
 *     errors.endDate = 'End date must be after start date';
 *   }
 *   return { valid: Object.keys(errors).length === 0, errors };
 * }
 *
 * // Create resolver with real-time proto validation
 * const form = useForm({
 *   resolver: createFormResolver({
 *     customValidator: validateMyForm,
 *     protoBuilder: buildMyProtoMessage,
 *     protoSchema: MyProtoSchema,
 *   }),
 *   defaultValues: initialValues,
 *   mode: 'onChange', // Enable real-time validation
 * });
 *
 * // Submit handler - validation already done!
 * const onSubmit = async (values: MyFormValues) => {
 *   const protoMessage = buildMyProtoMessage(values);
 *   await myMutation(protoMessage);
 * };
 * ```
 */
export function createFormResolver<TFormValues extends object, TProto extends Message = Message>(options?: {
  customValidator?: CustomValidator<TFormValues>;
  protoBuilder?: ProtoBuilder<TFormValues, TProto>;
  protoSchema?: DescMessage;
}): Resolver<TFormValues> {
  const validator = options?.protoSchema ? createValidator() : undefined;

  return (values: TFormValues) => {
    const allErrors: FieldErrors<TFormValues> = {};

    // Phase 1: Run custom validation if provided
    if (options?.customValidator) {
      const customValidation = options.customValidator(values);
      if (!customValidation.valid) {
        for (const [path, message] of Object.entries(customValidation.errors)) {
          setNestedError(allErrors as Record<string, unknown>, path, {
            type: 'custom',
            message,
          });
        }
      }
    }

    // Phase 2: Run proto validation if protoBuilder and schema provided
    if (options?.protoBuilder && options?.protoSchema && validator) {
      try {
        const protoMessage = options.protoBuilder(values);
        const result = validator.validate(options.protoSchema, protoMessage as Message);

        // Debug logging for proto validation
        if (result.kind !== 'valid') {
          console.log('Proto validation failed:', {
            kind: result.kind,
            violations: result.violations,
            violationCount: result.violations?.length || 0,
            protoMessage,
          });
        }

        if (result.kind !== 'valid') {
          if (!result.violations || result.violations.length === 0) {
            // No violations reported but validation failed - this is the silent failure case
            console.error('Proto validation failed but no violations were reported. This is a bug in the protovalidate library or proto schema.');
            setNestedError(allErrors as Record<string, unknown>, '_root', {
              type: 'protovalidate',
              message: 'Validation failed but no specific errors were reported. Please check the console for details.',
            });
          } else {
            // Process violations normally
            for (const violation of result.violations) {
              // Handle field path - can be string or array
              let path = 'unknown';
              if (typeof violation.field === 'string') {
                path = violation.field;
              } else if (Array.isArray(violation.field)) {
                // Field is an array of path segments - join them with dots
                // For map fields, the array might contain the key as an object
                path = violation.field
                  .map((segment) => {
                    if (typeof segment === 'string') {
                      return segment;
                    }
                    if (typeof segment === 'object' && segment !== null) {
                      // For map keys, check if it's a map_sub kind with a key property
                      if ('kind' in segment && segment.kind === 'map_sub' && 'key' in segment) {
                        return String(segment.key);
                      }
                      // For other objects, try to get a meaningful string representation
                      if ('name' in segment) {
                        return String(segment.name);
                      }
                      return String(segment);
                    }
                    return String(segment);
                  })
                  .filter((segment) => segment && segment !== '[object Object]')
                  .join('.');
              }

              console.log('Proto validation violation:', {
                field: violation.field,
                fieldType: typeof violation.field,
                fieldIsArray: Array.isArray(violation.field),
                message: violation.message,
                path,
              });

              setNestedError(allErrors as Record<string, unknown>, path, {
                type: 'protovalidate',
                message: violation.message,
              });
            }
          }
        }
      } catch (error) {
        // If proto building fails, add a general error
        console.error('Proto message building failed:', error);
        setNestedError(allErrors as Record<string, unknown>, '_root', {
          type: 'proto',
          message: `Failed to build proto message: ${(error as Error).message}`,
        });
      }
    }

    // Return errors if any, otherwise return valid
    if (Object.keys(allErrors).length > 0) {
      return { values: {}, errors: allErrors };
    }

    return { values, errors: {} };
  };
}

/**
 * Creates a React Hook Form resolver that validates proto messages directly
 *
 * Use this when your form values ARE proto messages (less common).
 * For most forms, use createFormResolver instead.
 *
 * @param schema - The protobuf message schema to validate against
 * @returns A React Hook Form resolver function
 *
 * @example
 * ```typescript
 * import { createProtoResolver } from 'utils/form-validation';
 * import { CreateUserRequestSchema } from 'protogen/user_pb';
 *
 * const form = useForm({
 *   resolver: createProtoResolver(CreateUserRequestSchema),
 *   defaultValues: initialProtoMessage,
 * });
 * ```
 */
export function createProtoResolver<TProto extends Message>(schema: DescMessage): Resolver<TProto> {
  const validator = createValidator();

  return (values: TProto) => {
    const result = validator.validate(schema, values as Message);

    if (result.kind === 'valid') {
      return { values, errors: {} };
    }

    const errors: FieldErrors<TProto> = {};

    if (result.violations) {
      for (const violation of result.violations) {
        const path = String(violation.field || 'unknown');
        setNestedError(errors as Record<string, unknown>, path, {
          type: 'protovalidate',
          message: violation.message,
        });
      }
    }

    return { values: {}, errors };
  };
}

/**
 * Validates a proto message and returns formatted errors
 *
 * Helper function for validating proto messages in submit handlers.
 *
 * @param schema - The protobuf message schema
 * @param message - The proto message to validate
 * @returns Validation result with errors
 *
 * @example
 * ```typescript
 * const onSubmit = async (values: MyFormValues) => {
 *   const protoMessage = buildMyProtoMessage(values);
 *   const validation = validateProtoMessage(MyProtoSchema, protoMessage);
 *
 *   if (!validation.valid) {
 *     for (const error of validation.errors) {
 *       toast.error(`${error.field}: ${error.message}`);
 *     }
 *     return;
 *   }
 *
 *   await myMutation(protoMessage);
 * };
 * ```
 */
export function validateProtoMessage<TProto extends Message>(
  schema: DescMessage,
  message: TProto
): {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
} {
  const validator = createValidator();
  const result = validator.validate(schema, message as Message);

  if (result.kind === 'valid') {
    return { valid: true, errors: [] };
  }

  const errors = (result.violations || []).map((violation) => ({
    field: String(violation.field || 'unknown field'),
    message: violation.message,
  }));

  return { valid: false, errors };
}
