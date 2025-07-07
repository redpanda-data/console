import { COMPONENT_TYPE, FieldSpec } from '@/components/node-editor/redpanda-connect/types';

export function generateDefaultValue(spec: FieldSpec): unknown {
  // Use the explicit default if it exists
  if (spec.default !== undefined) {
    return spec.default;
  }

  switch (spec.kind) {
    case 'scalar':
      switch (spec.type) {
        case 'string':
          return '';
        case 'int':
        case 'float':
          return 0;
        case 'bool':
          return false;
        case 'object': // A scalar object is a complex type, render its children
          if (spec.children) {
            return spec.children.reduce((acc, child) => {
              acc[child.name] = generateDefaultValue(child);
              return acc;
            }, {} as Record<string, unknown>);
          }
          return {};
        default:
          return ''; // Fallback for other types like 'input', 'processor' etc.
      }
    case 'array':
      return [];
    case '2darray':
      return [];
    case 'map':
      return {};
    default:
      return undefined;
  }
}

/** Build an empty object with defaults for every child field. */
export function buildObjectItem(children: FieldSpec[]): Record<string, unknown> {
  return children.reduce((acc, child) => {
    acc[child.name] = generateDefaultValue(child);
    return acc;
  }, {} as Record<string, unknown>);
}

/** Wrap primitives so RHF can inject its `id` property safely. */
export function wrapIfPrimitive(val: unknown) {
  return typeof val === 'object' && val !== null ? val : { value: val };
}

/** True when the child spec represents a single primitive value. */
export function isPrimitiveScalar(spec: FieldSpec) {
  return (
    spec.kind === 'scalar' &&
    spec.type !== 'object' && // object scalars are complex
    !isComponentType(spec.type)
  );
}

/** Does the `type` string correspond to a Benthos component type? */
export function isComponentType(t: string | undefined): boolean {
  return (COMPONENT_TYPE as readonly string[]).includes(t as string);
}

