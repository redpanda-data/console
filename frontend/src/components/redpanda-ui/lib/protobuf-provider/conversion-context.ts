import type { SchemaValidationError } from '../form-types';

type Path = Array<string | number>;

interface ConversionLocation {
  path: Path;
  terminal: boolean;
}

interface ConversionState {
  aliases: Map<string, Path>;
  errors: SchemaValidationError[];
  failedPaths: Set<string>;
  locations: Map<string, ConversionLocation>;
}

function pathKey(path: Path): string {
  // Standard Schema preserves numeric map keys as numbers; protobuf initializer keys are strings.
  return JSON.stringify(path.map((segment) => String(segment)));
}

/** Internal diagnostic state; a projection carrying this state is never submission data. */
export interface ConversionContext {
  formPath: Path;
  path: Path;
  state: ConversionState;
}

export function createConversionContext(): ConversionContext {
  return {
    path: [],
    formPath: [],
    state: { aliases: new Map(), errors: [], failedPaths: new Set(), locations: new Map() },
  };
}

export function conversionAt(
  context: ConversionContext | undefined,
  suffix: Path,
  formSuffix: Path = suffix,
  terminal = false
): ConversionContext | undefined {
  if (context === undefined) {
    return;
  }
  const path = [...context.path, ...suffix];
  const key = pathKey(path);
  const location = context.state.locations.get(key) ?? { path: [...context.formPath, ...formSuffix], terminal };
  context.state.locations.set(key, location);
  return { path, formPath: location.path, state: context.state };
}

export function conversionFailed(context: ConversionContext | undefined): boolean {
  return context?.state.failedPaths.has(pathKey(context.path)) ?? false;
}

/** Preserve legal numeric key spellings without confusing their canonical protobuf keys with other rows. */
export function aliasConversionPath(context: ConversionContext | undefined, inputKey: string, outputKey: string): void {
  if (context === undefined || inputKey === outputKey) {
    return;
  }
  context.state.aliases.set(pathKey([...context.path, outputKey]), [...context.path, inputKey]);
}

function originalIssuePath(context: ConversionContext, path: Path): Path {
  let original = path;
  let remainingParents = path.length;
  while (remainingParents > 0) {
    remainingParents -= 1;
    let replacement: Path | undefined;
    for (let length = original.length; length > 0; length -= 1) {
      const prefix = context.state.aliases.get(pathKey(original.slice(0, length)));
      if (prefix !== undefined) {
        replacement = [...prefix, ...original.slice(length)];
        break;
      }
    }
    if (replacement === undefined) {
      break;
    }
    original = replacement;
  }
  return original;
}

export function captureConversion<Value>(
  context: ConversionContext | undefined,
  convert: () => Value
): Value | undefined {
  if (conversionFailed(context)) {
    return;
  }
  try {
    return convert();
  } catch (error) {
    if (context === undefined) {
      throw error;
    }
    context.state.failedPaths.add(pathKey(context.path));
    context.state.errors.push({
      path: context.formPath,
      message: error instanceof Error ? error.message : 'Failed to convert this protobuf form value.',
    });
    return undefined;
  }
}

/** Map projected repeated indexes and protobuf map keys back to the authored form rows. */
export function conversionIssuePath(context: ConversionContext, path: Path): Path {
  const original = originalIssuePath(context, path);
  for (let length = original.length; length > 0; length -= 1) {
    const location = context.state.locations.get(pathKey(original.slice(0, length)));
    if (location !== undefined) {
      return location.terminal ? location.path : [...location.path, ...original.slice(length)];
    }
  }
  return path;
}

/** Ancestor constraints are also indeterminate when their collection/message contains invalid data. */
export function affectedByConversion(path: Path, errors: SchemaValidationError[]): boolean {
  return errors.some((error) => {
    const commonLength = Math.min(path.length, error.path.length);
    for (let index = 0; index < commonLength; index += 1) {
      if (path[index] !== error.path[index]) {
        return false;
      }
    }
    return true;
  });
}
