import type { JSONSchema } from 'monaco-yaml';
import { z } from 'zod';

const text = z.string().optional();
const number = z.number().optional();
const flag = z.boolean().optional();
const texts = z.array(z.string()).optional();
const completionKind = z.literal([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
]);

/** Validate every known Monaco YAML schema field while retaining extension keywords. */
export const jsonSchemaSchema: z.ZodType<JSONSchema> = z.lazy(() =>
  z.looseObject({
    id: text,
    $id: text,
    $schema: text,
    url: text,
    type: z.union([z.string(), z.array(z.string())]).optional(),
    title: text,
    closestTitle: text,
    versions: z.record(z.string(), z.string()).optional(),
    default: z.unknown().optional(),
    definitions: z.record(z.string(), jsonSchemaSchema).optional(),
    description: text,
    properties: z.record(z.string(), schemaValue).optional(),
    patternProperties: z.record(z.string(), schemaValue).optional(),
    additionalProperties: schemaValue.optional(),
    minProperties: number,
    maxProperties: number,
    dependencies: z.record(z.string(), z.union([schemaValue, z.array(z.string())])).optional(),
    items: z.union([schemaValue, z.array(schemaValue)]).optional(),
    minItems: number,
    maxItems: number,
    uniqueItems: flag,
    additionalItems: schemaValue.optional(),
    pattern: text,
    minLength: number,
    maxLength: number,
    minimum: number,
    maximum: number,
    exclusiveMinimum: z.union([z.boolean(), z.number()]).optional(),
    exclusiveMaximum: z.union([z.boolean(), z.number()]).optional(),
    multipleOf: number,
    required: texts,
    $ref: text,
    anyOf: z.array(schemaValue).optional(),
    allOf: z.array(schemaValue).optional(),
    oneOf: z.array(schemaValue).optional(),
    not: schemaValue.optional(),
    enum: z.array(z.unknown()).optional(),
    format: text,
    const: z.unknown().optional(),
    contains: schemaValue.optional(),
    propertyNames: schemaValue.optional(),
    examples: z.array(z.unknown()).optional(),
    $comment: text,
    if: schemaValue.optional(),
    // biome-ignore lint/suspicious/noThenProperty: JSON Schema's conditional keyword is data, not a thenable callback.
    then: schemaValue.optional(),
    else: schemaValue.optional(),
    defaultSnippets: z
      .array(
        z.looseObject({
          label: text,
          description: text,
          markdownDescription: text,
          type: text,
          suggestionKind: completionKind.optional(),
          sortText: text,
          body: z.unknown().optional(),
          bodyText: text,
        })
      )
      .optional(),
    errorMessage: text,
    patternErrorMessage: text,
    deprecationMessage: text,
    enumDescriptions: texts,
    markdownEnumDescriptions: texts,
    markdownDescription: text,
    doNotSuggest: flag,
    allowComments: flag,
    schemaSequence: z.array(jsonSchemaSchema).optional(),
    filePatternAssociation: text,
  })
);

const schemaValue = z.union([z.boolean(), jsonSchemaSchema]);

/** Malformed remote or bundled schema data must not reach Monaco's schema consumer. */
export function parseJsonSchema(value: unknown): JSONSchema | undefined {
  const parsed = jsonSchemaSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
