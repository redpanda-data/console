import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ValidateFunction } from 'ajv';
import Ajv from 'ajv';
import type { JsonSchemaType } from './json-utils';

const ajv = new Ajv();

// Cache for compiled validators
const toolOutputValidators = new Map<string, ValidateFunction>();

/**
 * Compiles and caches output schema validators for a list of tools
 * Following the same pattern as SDK's Client.cacheToolOutputSchemas
 * @param tools Array of tools that may have output schemas
 */
export function cacheToolOutputSchemas(tools: Tool[]): void {
  toolOutputValidators.clear();
  for (const tool of tools) {
    if (tool.outputSchema) {
      try {
        const validator = ajv.compile(tool.outputSchema);
        toolOutputValidators.set(tool.name, validator);
      } catch (error) {
        console.warn(`Failed to compile output schema for tool ${tool.name}:`, error);
      }
    }
  }
}

/**
 * Gets the cached output schema validator for a tool
 * Following the same pattern as SDK's Client.getToolOutputValidator
 * @param toolName Name of the tool
 * @returns The compiled validator function, or undefined if not found
 */
export function getToolOutputValidator(toolName: string): ValidateFunction | undefined {
  return toolOutputValidators.get(toolName);
}

/**
 * Validates structured content against a tool's output schema
 * Returns validation result with detailed error messages
 * @param toolName Name of the tool
 * @param structuredContent The structured content to validate
 * @returns An object with isValid boolean and optional error message
 */
export function validateToolOutput(toolName: string, structuredContent: unknown): { isValid: boolean; error?: string } {
  const validator = getToolOutputValidator(toolName);
  if (!validator) {
    return { isValid: true }; // No validator means no schema to validate against
  }

  const isValid = validator(structuredContent);
  if (!isValid) {
    return {
      isValid: false,
      error: ajv.errorsText(validator.errors),
    };
  }

  return { isValid: true };
}

/**
 * Checks if a tool has an output schema
 * @param toolName Name of the tool
 * @returns true if the tool has an output schema
 */
export function hasOutputSchema(toolName: string): boolean {
  return toolOutputValidators.has(toolName);
}

// Re-export from shared utilities
export { generateDefaultFromJsonSchema as generateDefaultValue, isPropertyRequired } from 'utils/json-schema-utils';

/**
 * Normalizes union types (like string|null from FastMCP) to simple types for form rendering
 * @param schema The JSON schema to normalize
 * @returns A normalized schema or the original schema
 */
export function normalizeUnionType(schema: JsonSchemaType): JsonSchemaType {
  // Handle anyOf with exactly string and null (FastMCP pattern)
  if (
    schema.anyOf &&
    schema.anyOf.length === 2 &&
    schema.anyOf.some((t) => (t as JsonSchemaType).type === 'string') &&
    schema.anyOf.some((t) => (t as JsonSchemaType).type === 'null')
  ) {
    return { ...schema, type: 'string', anyOf: undefined };
  }

  // Handle anyOf with exactly boolean and null (FastMCP pattern)
  if (
    schema.anyOf &&
    schema.anyOf.length === 2 &&
    schema.anyOf.some((t) => (t as JsonSchemaType).type === 'boolean') &&
    schema.anyOf.some((t) => (t as JsonSchemaType).type === 'null')
  ) {
    return { ...schema, type: 'boolean', anyOf: undefined };
  }

  // Handle anyOf with exactly number and null (FastMCP pattern)
  if (
    schema.anyOf &&
    schema.anyOf.length === 2 &&
    schema.anyOf.some((t) => (t as JsonSchemaType).type === 'number') &&
    schema.anyOf.some((t) => (t as JsonSchemaType).type === 'null')
  ) {
    return { ...schema, type: 'number', anyOf: undefined };
  }

  // Handle anyOf with exactly integer and null (FastMCP pattern)
  if (
    schema.anyOf &&
    schema.anyOf.length === 2 &&
    schema.anyOf.some((t) => (t as JsonSchemaType).type === 'integer') &&
    schema.anyOf.some((t) => (t as JsonSchemaType).type === 'null')
  ) {
    return { ...schema, type: 'integer', anyOf: undefined };
  }

  // Handle array type with exactly string and null
  if (
    Array.isArray(schema.type) &&
    schema.type.length === 2 &&
    schema.type.includes('string') &&
    schema.type.includes('null')
  ) {
    return { ...schema, type: 'string' };
  }

  // Handle array type with exactly boolean and null
  if (
    Array.isArray(schema.type) &&
    schema.type.length === 2 &&
    schema.type.includes('boolean') &&
    schema.type.includes('null')
  ) {
    return { ...schema, type: 'boolean' };
  }

  // Handle array type with exactly number and null
  if (
    Array.isArray(schema.type) &&
    schema.type.length === 2 &&
    schema.type.includes('number') &&
    schema.type.includes('null')
  ) {
    return { ...schema, type: 'number' };
  }

  // Handle array type with exactly integer and null
  if (
    Array.isArray(schema.type) &&
    schema.type.length === 2 &&
    schema.type.includes('integer') &&
    schema.type.includes('null')
  ) {
    return { ...schema, type: 'integer' };
  }

  return schema;
}

/**
 * Formats a field key into a human-readable label
 * @param key The field key to format
 * @returns A formatted label string
 */
export function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1') // Insert space before capital letters
    .replace(/_/g, ' ') // Replace underscores with spaces
    .replace(/^\w/, (c) => c.toUpperCase()); // Capitalize first letter
}
