// Copyright 2026 Redpanda Data, Inc.

import { type Document, isNode, isPair, isScalar, parseDocument, visit } from 'yaml';

import type { EditTarget, ResourceArrayKey } from './yaml-edit-target';
import { YAML_STRINGIFY_OPTIONS } from './yaml-values';
import { isObject, isUnknownArray } from '../../../../utils/type-guards';

// Resource references: a `cache`/`rate_limit` processor's `resource:` must equal a `*_resources`
// entry's `label:`. These helpers link by label so references never drift out of sync.

export type ResourceKind = 'cache' | 'rate_limit';

export const RESOURCE_KEY_BY_KIND: Record<ResourceKind, ResourceArrayKey> = {
  cache: 'cache_resources',
  rate_limit: 'rate_limit_resources',
};

/** The top-level resource array key for a kind (cache → cache_resources). */
export function resourceArrayKey(kind: ResourceKind): ResourceArrayKey {
  return RESOURCE_KEY_BY_KIND[kind];
}

/** The resource kind a `cache`/`rate_limit` component name maps to, else undefined. */
export function resourceKindForComponentName(name: string): ResourceKind | undefined {
  return name === 'cache' || name === 'rate_limit' ? name : undefined;
}

/** The resource kind of a `resource` edit target (cache_resources → cache, …). */
export function resourceTargetKind(target: EditTarget): ResourceKind | undefined {
  if (target.kind !== 'resource') {
    return;
  }
  return target.resourceKey === 'cache_resources' ? 'cache' : 'rate_limit';
}

// Resource kinds a reference can point at: cache/rate_limit plus the section-scoped `*_resources`
// arrays reached through `resource:` indirection components.
export type ResourceRefKind = ResourceKind | 'input' | 'processor' | 'output';

/**
 * The resource kind a FIELD NAME references by string value — dedupe's `cache:`, a CDC input's
 * `checkpoint_cache:`, http's `rate_limit:`. Shared by the flow parser's candidate promotion and
 * the rename/count visitors below so a ref recognised on the canvas is also followed on rename.
 */
export function resourceKindForFieldName(name: string): ResourceKind | undefined {
  if (name === 'cache' || name.endsWith('_cache')) {
    return 'cache';
  }
  if (name === 'rate_limit' || name.endsWith('_rate_limit')) {
    return 'rate_limit';
  }
}

const PATH_RESOURCE_REF_KIND: Record<string, ResourceRefKind> = {
  input_resources: 'input',
  processor_resources: 'processor',
  output_resources: 'output',
};

/** The ref kind of a `*_resources` item edited via a path target (input_resources → input, …). */
export function pathResourceRefKind(target: EditTarget): ResourceRefKind | undefined {
  if (target.kind !== 'path' || target.path.length !== 2) {
    return;
  }
  const [key] = target.path;
  return typeof key === 'string' ? PATH_RESOURCE_REF_KIND[key] : undefined;
}

/** The ref kind an edit target's component can be referenced by, across both target shapes. */
export function resourceRefKindForTarget(target: EditTarget): ResourceRefKind | undefined {
  return resourceTargetKind(target) ?? pathResourceRefKind(target);
}

/** Labels of every resource of a kind, in document order — the options for a reference dropdown. */
export function listResourceLabels(yaml: string, kind: ResourceKind): string[] {
  try {
    const node = parseDocument(yaml).getIn([RESOURCE_KEY_BY_KIND[kind]]);
    const items: unknown = isNode(node) ? node.toJSON() : undefined;
    if (!isUnknownArray(items)) {
      return [];
    }
    return items
      .map((r) => (isObject(r) ? r.label : undefined))
      .filter((l): l is string => typeof l === 'string' && l !== '');
  } catch {
    return [];
  }
}

/** Pick a label not already used by a resource of this kind, suffixing `_N` on collision. */
export function uniqueResourceLabel(existing: string[], base: string): string {
  if (!existing.includes(base)) {
    return base;
  }
  let counter = 1;
  while (existing.includes(`${base}_${counter}`)) {
    counter += 1;
  }
  return `${base}_${counter}`;
}

// The kind a `resource:` pair references, from its nearest decisive ancestor key: inside a
// `cache`/`rate_limit` component it is that component's own resource field; under `input(s)`/
// `output(s)`/`processors` it is a section indirection running a `*_resources` entry.
function resourcePairRefKind(path: readonly unknown[]): ResourceRefKind | undefined {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const ancestor = path[i];
    if (!(isPair(ancestor) && isScalar(ancestor.key))) {
      continue;
    }
    switch (ancestor.key.value) {
      case 'cache':
      case 'rate_limit':
        return ancestor.key.value;
      case 'input':
      case 'inputs':
        return 'input';
      case 'output':
      case 'outputs':
        return 'output';
      case 'processors':
        return 'processor';
      default:
      // Not decisive (broker, cases, …) — keep walking up.
    }
  }
}

// Visit every reference to a resource label: `resource:` pairs plus name-referencing fields
// (`cache:`, `checkpoint_cache:`, `rate_limit:`). With `kind`, only references of that kind,
// so a cache rename can't touch a same-labelled rate_limit or input resource reference.
function visitResourceReferences(
  doc: Document.Parsed,
  label: string,
  kind: ResourceRefKind | undefined,
  onMatch: (value: { value: unknown }) => void
): void {
  visit(doc, {
    Pair(_, pair, path) {
      if (!(isScalar(pair.key) && isScalar(pair.value) && pair.value.value === label)) {
        return;
      }
      const key = pair.key.value;
      const refKind =
        key === 'resource'
          ? resourcePairRefKind(path)
          : typeof key === 'string'
            ? resourceKindForFieldName(key)
            : undefined;
      // A non-`resource` field only counts as a reference when its NAME marks it as one.
      if (key !== 'resource' && refKind === undefined) {
        return;
      }
      if (!kind || refKind === kind) {
        onMatch(pair.value);
      }
    },
  });
}

/**
 * Repoint every reference from `oldLabel` to `newLabel`. With `kind`, only references
 * of that resource kind are rewritten; without it, every matching reference is.
 */
export function renameResourceReferences(
  yaml: string,
  oldLabel: string,
  newLabel: string,
  kind?: ResourceRefKind
): string | null {
  if (oldLabel === '' || oldLabel === newLabel) {
    return yaml;
  }
  try {
    const doc = parseDocument(yaml);
    visitResourceReferences(doc, oldLabel, kind, (value) => {
      value.value = newLabel;
    });
    return doc.toString(YAML_STRINGIFY_OPTIONS);
  } catch {
    return null;
  }
}

/**
 * Count how many components reference a resource label (via `resource:` or a name-referencing
 * field). With `kind`, only references belonging to that resource kind are counted.
 */
export function countResourceReferences(yaml: string, label: string, kind?: ResourceRefKind): number {
  if (!label) {
    return 0;
  }
  try {
    const doc = parseDocument(yaml);
    let count = 0;
    visitResourceReferences(doc, label, kind, () => {
      count += 1;
    });
    return count;
  } catch {
    return 0;
  }
}
