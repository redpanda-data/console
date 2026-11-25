// Copyright 2026 Redpanda Data, Inc.

import type { ConnectComponentType } from '../types/schema';

// Visual-editor mutations: pure yaml -> (yaml | null) transforms over a parsed Document so comments/
// formatting survive; `null` on parse failure keeps prior content.

import { firstKey, slotComponentKey } from './yaml-values';

export type ResourceArrayKey = 'cache_resources' | 'rate_limit_resources';

/**
 * Addresses a visually editable component. Early kinds are top-level conveniences (with tailored
 * prune-on-delete); `path` addresses any nested component by exact YAML location + schema type. An
 * input under `input` is addressed by its slot, and read and written through its `read_until`
 * (`targetComponentPath`), so a stop condition never moves its target.
 */
export type EditTarget =
  | { kind: 'input' }
  | { kind: 'output' }
  | { kind: 'processor'; index: number }
  | { kind: 'resource'; resourceKey: ResourceArrayKey; index: number }
  | { kind: 'path'; path: (string | number)[]; componentType: ConnectComponentType }
  // A `switch` case object — edited for its routing condition; body components are their own nodes.
  | { kind: 'switchCase'; path: (string | number)[] };

/** The YAML path (for `getIn`/`setIn`) of an edit target's component object, or of an input's slot. */
export function editTargetPath(target: EditTarget): (string | number)[] {
  switch (target.kind) {
    case 'input':
      return ['input'];
    case 'output':
      return ['output'];
    case 'processor':
      return ['pipeline', 'processors', target.index];
    case 'path':
    case 'switchCase':
      return target.path;
    case 'resource':
    default:
      return [target.resourceKey, target.index];
  }
}

/** The component name of what `target` holds: input and output slots skip their own `processors`. */
export function componentKeyAt(target: EditTarget, component: unknown): string | undefined {
  const type = targetComponentType(target);
  return type === 'input' || type === 'output' ? slotComponentKey(component) : firstKey(component);
}

/** The component type an edit target loads its schema/config as. */
export function targetComponentType(target: EditTarget): ConnectComponentType {
  switch (target.kind) {
    case 'input':
      return 'input';
    case 'output':
      return 'output';
    case 'processor':
      return 'processor';
    case 'path':
      return target.componentType;
    case 'switchCase':
      // Never used for rendering (the inspector special-cases switchCase first).
      return 'processor';
    case 'resource':
    default:
      return target.resourceKey === 'cache_resources' ? 'cache' : 'rate_limit';
  }
}

// Structural equality of two edit targets — to find the parsed node for a just-inserted target.
// Path/switchCase targets are identified by their YAML path; the rest by their discriminant fields.
export function editTargetsEqual(a: EditTarget | undefined, b: EditTarget): boolean {
  if (a?.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'processor' && b.kind === 'processor') {
    return a.index === b.index;
  }
  if (a.kind === 'resource' && b.kind === 'resource') {
    return a.resourceKey === b.resourceKey && a.index === b.index;
  }
  if ((a.kind === 'path' || a.kind === 'switchCase') && (b.kind === 'path' || b.kind === 'switchCase')) {
    return JSON.stringify(a.path) === JSON.stringify(b.path);
  }
  return true; // input / output — singletons, kind match is enough
}
