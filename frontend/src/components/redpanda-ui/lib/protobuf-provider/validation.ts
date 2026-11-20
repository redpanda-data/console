// Copyright 2026 Redpanda Data, Inc.
import type { DescMessage, MessageShape, MessageValidType } from '@bufbuild/protobuf';
import type { ValidatorOptions } from '@bufbuild/protovalidate';
import { toNestErrors, validateFieldsNatively } from '@hookform/resolvers';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Resolver } from 'react-hook-form';
import type { SchemaValidation } from '../form-types';
import { humanizeValidationError, isGenericValidationMessage } from '../humanize-validation-error';
import { affectedByConversion, type ConversionContext, conversionIssuePath } from './conversion-context';
import { collectProtoFormDiagnostics } from './form-values';
import { createProtoValidationSchema } from './validation-schema';

export const PROTO_FORM_ROOT_ERROR_KEY = '__protoFormRoot__';

type SchemaIssue = StandardSchemaV1.Issue;

function normalizeIssuePath(issue: SchemaIssue, context: ConversionContext): Array<string | number> {
  const path = (issue.path ?? []).map((segment) => {
    const key = typeof segment === 'object' ? segment.key : segment;
    return typeof key === 'number' ? key : String(key);
  });
  return conversionIssuePath(context, path);
}

function mapValidationResult<Desc extends DescMessage>(
  context: ConversionContext,
  validationResult: StandardSchemaV1.Result<MessageValidType<Desc>>
): SchemaValidation<MessageValidType<Desc>> {
  if ('issues' in validationResult && validationResult.issues !== undefined) {
    return {
      success: false,
      errors: validationResult.issues.map((issue) => ({
        path: normalizeIssuePath(issue, context),
        message: issue.message,
      })),
    };
  }

  return {
    success: true,
    data: validationResult.value,
  };
}

function combineConversionErrors<Desc extends DescMessage>(
  context: ConversionContext,
  validation: SchemaValidation<MessageValidType<Desc>>
): SchemaValidation<MessageValidType<Desc>> {
  const conversionErrors = context.state.errors;
  if (conversionErrors.length === 0) {
    return validation;
  }
  const independentErrors = validation.success
    ? []
    : validation.errors.filter((error) => !affectedByConversion(error.path, conversionErrors));
  return {
    success: false,
    errors: [
      ...conversionErrors,
      ...independentErrors,
      {
        path: [],
        message:
          'Message-level and affected collection constraints could not be fully evaluated until the protobuf conversion errors are fixed.',
      },
    ],
  };
}

function validationFailure(error: unknown, conversionErrors: ValidationErrors): SchemaValidation<never> {
  return {
    success: false,
    errors: [
      ...conversionErrors,
      {
        path: [],
        message: error instanceof Error ? error.message : 'Failed to validate protobuf form values.',
      },
    ],
  };
}

export function validateProtoValues<Desc extends DescMessage>(
  desc: Desc,
  values: Record<string, unknown>,
  schema: StandardSchemaV1<MessageShape<Desc>, MessageValidType<Desc>>
): SchemaValidation<MessageValidType<Desc>> | Promise<SchemaValidation<MessageValidType<Desc>>> {
  let conversionErrors: ValidationErrors = [];
  try {
    const { projection, context } = collectProtoFormDiagnostics(desc, values);
    conversionErrors = context.state.errors;
    const validationResult = schema['~standard'].validate(projection);
    const finish = (result: StandardSchemaV1.Result<MessageValidType<Desc>>) =>
      combineConversionErrors<Desc>(context, mapValidationResult<Desc>(context, result));
    if (validationResult instanceof Promise) {
      return validationResult.then(finish).catch((error: unknown) => validationFailure(error, conversionErrors));
    }
    return finish(validationResult);
  } catch (error) {
    return validationFailure(error, conversionErrors);
  }
}

type ValidationErrors = Extract<SchemaValidation, { success: false }>['errors'];
type FlatErrors = Record<string, { message: string; type: string }>;

function flattenFieldErrors(errors: ValidationErrors): FlatErrors {
  // Custom CEL messages take precedence over generic constraints on the same field.
  const raw: Record<string, { message: string; isGeneric: boolean }> = {};
  for (const error of errors) {
    if (error.path.length === 0) {
      continue;
    }
    const path = error.path.join('.');
    const generic = isGenericValidationMessage(error.message);
    const existing = raw[path];
    if (existing === undefined || (existing.isGeneric && !generic)) {
      raw[path] = { message: error.message, isGeneric: generic };
    }
  }
  const flattened: FlatErrors = {};
  for (const [path, entry] of Object.entries(raw)) {
    flattened[path] = { message: humanizeValidationError(entry.message), type: 'validation' };
  }
  return flattened;
}

function flattenValidationErrors(errors: ValidationErrors): FlatErrors {
  const flattened = flattenFieldErrors(errors);
  const rootMessages = errors.flatMap((error) =>
    error.path.length === 0 ? [humanizeValidationError(error.message)] : []
  );
  if (rootMessages.length > 0) {
    const root = { type: 'validation', message: rootMessages.join('\n') };
    flattened['root'] = root;
    flattened[PROTO_FORM_ROOT_ERROR_KEY] = root;
  }
  return flattened;
}

export function createProtoResolver<
  Desc extends DescMessage,
  Input extends Record<string, unknown> = Record<string, unknown>,
>(desc: Desc, options?: ValidatorOptions): Resolver<Input, unknown, MessageValidType<Desc>> {
  const standardSchema = createProtoValidationSchema(desc, options);
  return async (values, _context, resolverOptions) => {
    const validation = await validateProtoValues(desc, values, standardSchema);
    if (validation.success) {
      if (resolverOptions.shouldUseNativeValidation === true) {
        validateFieldsNatively({}, resolverOptions);
      }
      return { values: validation.data, errors: {} };
    }
    return { values: {}, errors: toNestErrors(flattenValidationErrors(validation.errors), resolverOptions) };
  };
}
