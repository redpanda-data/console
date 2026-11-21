/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { ElementTooltip } from 'components/misc/element-tooltip';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Button } from 'components/redpanda-ui/components/button';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { cn } from 'components/redpanda-ui/lib/utils';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { ChevronRight } from 'lucide-react';
import { useContext, useEffect, useId, useRef } from 'react';
import { type Control, Controller, useForm, useWatch } from 'react-hook-form';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';

import type { FieldLintErrors } from './lint-field-mapping';
import {
  ArrayField,
  arrayFieldLines,
  FieldGroup,
  FieldLintErrorList,
  FieldLintErrorsContext,
  type FormValues,
  type Leaf,
  numericHint,
  ResourceFieldContext,
  type ResourceFieldContextValue,
  ScalarField,
} from './node-config-fields';
import { ScrollShadow } from './scroll-shadow';
import { isNonzeroNumber } from '../../../../utils/number-utils';
import { isNonEmptyString } from '../../../../utils/string-utils';
import { isObject } from '../../../../utils/type-guards';
import { REDPANDA_TOPIC_AND_USER_COMPONENTS } from '../types/constants';
import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';
import { getFieldDocsUrl } from '../utils/connector-docs';
import {
  checkRequired,
  isComponentField,
  isFormField,
  isObjectGroupField,
  isScalarArrayField,
  isScalarField,
} from '../utils/schema';
import type { EditTarget } from '../utils/yaml-edit-target';
import type { ResourceKind } from '../utils/yaml-resources';
import { resourceKindForComponentName } from '../utils/yaml-resources';

// A direct child (case / step) of a control-flow component, shown as a clickable row to its full config.
export type InspectorChildItem = {
  id: string;
  target: EditTarget;
  caseTarget?: EditTarget;
  name: string;
  condition?: string;
  isDefault?: boolean;
  isErrorPath?: boolean;
  lintCount?: number;
};

const childItemConditionText = (item: InspectorChildItem): string | undefined => {
  if (isNonEmptyString(item.condition)) {
    return `if ${item.condition}`;
  }
  if (item.isDefault === true) {
    return 'default';
  }
  if (item.isErrorPath === true) {
    return 'on error';
  }
};

const childItemCondColor = (item: InspectorChildItem): string => {
  if (item.isErrorPath === true) {
    return 'text-destructive';
  }
  if (item.isDefault === true) {
    return 'text-muted-foreground';
  }
  return 'text-warning';
};

const ChildItemRow = ({
  item,
  onSelect,
}: {
  item: InspectorChildItem;
  onSelect: (item: InspectorChildItem) => void;
}) => {
  const condText = childItemConditionText(item);
  return (
    <Button
      // biome-ignore lint/nursery/noTailwindRestyledComponents: Registry unstyled variant owns this compound control's appearance.
      className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-left transition-colors outline-none hover:border-primary/50 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      onClick={() => onSelect(item)}
      type="button"
      variant="unstyled"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {condText !== null && condText !== undefined && condText !== '' ? (
          <ElementTooltip content={condText}>
            <span className={cn('truncate font-mono text-caption font-medium', childItemCondColor(item))}>
              {condText}
            </span>
          </ElementTooltip>
        ) : null}
        <ElementTooltip content={item.name}>
          <span className="truncate text-body font-medium">{item.name}</span>
        </ElementTooltip>
      </div>
      {isNonzeroNumber(item.lintCount) ? <CountDot count={item.lintCount} size="sm" variant="destructive" /> : null}
      <TonedIcon className="size-4 shrink-0" icon={ChevronRight} tone="muted" />
    </Button>
  );
};

export const ChildItemsList = ({
  items,
  onSelect,
  label,
}: {
  items: InspectorChildItem[];
  onSelect: (item: InspectorChildItem) => void;
  label: string;
}) => (
  // A heading, not a <label>: the rows are buttons with their own accessible text; nothing for htmlFor.
  <div className="flex flex-col gap-1.5">
    <div className="text-body font-medium">{label}</div>
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <ChildItemRow item={item} key={item.id} onSelect={onSelect} />
      ))}
    </div>
    <div className="text-body-sm text-muted-foreground">Select one to open its full configuration.</div>
  </div>
);

// Path helpers for the plain-JSON config object (not the YAML AST).
function getInObj(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isObject(cur)) {
      return;
    }
    cur = cur[key];
  }
  return cur;
}

function childMapping(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const next = parent[key];
  if (isObject(next) && !Array.isArray(next)) {
    return next;
  }
  const child: Record<string, unknown> = {};
  parent[key] = child;
  return child;
}

function setInObj(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let cur = obj;
  const parentPath = path.slice(0, -1);
  for (const key of parentPath) {
    cur = childMapping(cur, key);
  }
  const last = path.at(-1);
  if (last === undefined) {
    return;
  }
  cur[last] = value;
}

function deleteInObj(obj: Record<string, unknown>, path: string[]): void {
  const parent = path.slice(0, -1).reduce<Record<string, unknown> | undefined>((cur, key) => {
    const next = cur?.[key];
    return isObject(next) ? next : undefined;
  }, obj);
  const last = path.at(-1);
  if (parent && last !== undefined) {
    delete parent[last];
  }
}

// Drop objects that became empty after clearing their fields, so the YAML stays tidy.
function pruneEmptyObjects(obj: Record<string, unknown>): void {
  for (const [key, val] of Object.entries(obj)) {
    if (isObject(val) && !Array.isArray(val)) {
      pruneEmptyObjects(val);
      if (Object.keys(val).length === 0) {
        delete obj[key];
      }
    }
  }
}

function initialScalar(spec: RawFieldSpec, current: unknown): string | boolean {
  const isMissing = current === undefined || current === null;
  if (spec.type === 'bool') {
    return isMissing ? spec.defaultValue === 'true' : Boolean(current);
  }
  if (isMissing) {
    return '';
  }
  return String(current);
}

function coerceScalar(spec: RawFieldSpec, raw: string | boolean): string | number | boolean {
  if (spec.type === 'bool') {
    return Boolean(raw);
  }
  const text = String(raw);
  if (spec.type === 'int' || spec.type === 'float') {
    return coerceNumericText(text, spec.type === 'int');
  }
  return text;
}

// '' when the literal doesn't parse, which the save path drops.
function coerceNumericText(text: string, integer: boolean): string | number {
  // Interpolations (`${ENV}`, secrets, Bloblang) are valid even in numeric fields — keep verbatim
  // rather than coercing to NaN (→ '' → dropped on commit). Matches numericHint.
  if (text.includes('${')) {
    return text;
  }
  if (integer) {
    const n = Number.parseInt(text, 10);
    return Number.isNaN(n) ? '' : n;
  }
  const n = Number(text);
  return text === '' || Number.isNaN(n) ? '' : n;
}

function coerceArrayItems(spec: RawFieldSpec, text: string): unknown[] {
  const lines = arrayFieldLines(text);
  if (spec.type === 'int' || spec.type === 'float') {
    return lines.map(Number).filter((n) => !Number.isNaN(n));
  }
  return lines;
}
type Leaves = { scalars: Leaf[]; arrays: Leaf[] };

/** All scalar + scalar-array leaves (recursing into object groups), keyed by path. */
function collectLeaves(fields: RawFieldSpec[], base: string[] = []): Leaves {
  const leaves: Leaves = { scalars: [], arrays: [] };
  for (const f of fields) {
    if (!f.deprecated) {
      collectFieldLeaves(f, [...base, f.name], leaves);
    }
  }
  return leaves;
}

// Files one field under its leaf kind, or recurses into it when it is an object group.
function collectFieldLeaves(field: RawFieldSpec, path: string[], leaves: Leaves): void {
  const leaf: Leaf = { spec: field, path, key: path.join('/') };
  if (isScalarField(field)) {
    leaves.scalars.push(leaf);
  } else if (isScalarArrayField(field)) {
    leaves.arrays.push(leaf);
  } else if (isObjectGroupField(field)) {
    const nested = collectLeaves(field.children ?? [], path);
    leaves.scalars.push(...nested.scalars);
    leaves.arrays.push(...nested.arrays);
  }
}

// Paths of the nested object groups the form renders as collapsible sections (tls, batching, …).
function collectGroupKeys(fields: RawFieldSpec[], base: string[] = [], out: string[] = []): string[] {
  for (const f of fields) {
    if (f.deprecated || !isObjectGroupField(f)) {
      continue;
    }
    const path = [...base, f.name];
    out.push(path.join('/'));
    collectGroupKeys(f.children ?? [], path, out);
  }
  return out;
}

/**
 * Keys the schema form renders — leaf inputs, `label`, and object-group sections — i.e. the
 * anchors lint errors can attach to. A group anchor renders at the top of its (auto-opened)
 * section, which is as specific as an error on the group itself (`batching: null`) can get.
 */
export function formFieldKeys(spec: ConnectComponentSpec): ReadonlySet<string> {
  const fields = spec.config?.children ?? [];
  const leaves = collectLeaves(fields);
  return new Set([
    'label',
    ...leaves.scalars.map((l) => l.key),
    ...leaves.arrays.map((l) => l.key),
    ...collectGroupKeys(fields),
  ]);
}

// The lint errors anchored at `prefix` or anywhere under it, joined into one signature string.
// Groups force-open when the signature CHANGES: mere truthiness would leave errors that arrive
// after a manual collapse invisible, while reopening on every lint refresh would fight the user.
function lintErrorSignatureUnder(errors: FieldLintErrors, prefix: string): string {
  const messages: string[] = [];
  for (const [key, list] of errors) {
    if (key === prefix || key.startsWith(`${prefix}/`)) {
      messages.push(...list);
    }
  }
  return messages.join('\n');
}

function useLintErrorSignatureUnder(prefix: string[]): string {
  return lintErrorSignatureUnder(useContext(FieldLintErrorsContext), prefix.join('/'));
}

// Parse the "Other settings (YAML)" text: the mapping, `{}` when empty (intentional clear), or
// `null` when invalid / not a mapping — so callers preserve existing keys instead of wiping them.
function parseRawSection(showRaw: boolean, raw: string): Record<string, unknown> | null {
  if (!(showRaw && raw.trim())) {
    return {};
  }
  try {
    const parsed: unknown = parseYaml(raw);
    // Empty / comments-only parses to nullish — treat as an intentional clear, not invalid.
    if (parsed === null || parsed === undefined) {
      return {};
    }
    return isObject(parsed) && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Which form fields the user actually edited (react-hook-form dirty state).
type DirtyState = { fields?: Record<string, unknown>; arrays?: Record<string, unknown>; raw?: unknown };

type BuildArgs = {
  componentName: string;
  /** The full component entry being edited, e.g. `{ label, switch: [...] }`. */
  value: Record<string, unknown>;
  inner: Record<string, unknown>;
  leaves: Leaves;
  rawKeys: string[];
  showRaw: boolean;
  data: FormValues;
  dirty: DirtyState;
  /** Resources are referenced by label — never drop it, even if the field is cleared. */
  requireLabel?: boolean;
};

function applyScalarEdits(config: Record<string, unknown>, scalars: Leaf[], data: FormValues, dirty: DirtyState): void {
  for (const { spec, path, key } of scalars) {
    if (!Boolean(dirty.fields?.[key])) {
      continue;
    }
    // A malformed numeric literal is flagged and NOT committed — coercing would silently truncate
    // (`10x` → 10) or drop it; the saved value is kept until fixed.
    if (isNonEmptyString(numericHint(spec, data.fields[key]))) {
      continue;
    }
    const coerced = coerceScalar(spec, data.fields[key]);
    if (spec.type === 'bool' || coerced !== '') {
      setInObj(config, path, coerced);
    } else {
      deleteInObj(config, path);
    }
  }
}

function applyArrayEdits(config: Record<string, unknown>, arrays: Leaf[], data: FormValues, dirty: DirtyState): void {
  for (const { spec, path, key } of arrays) {
    if (!Boolean(dirty.arrays?.[key])) {
      continue;
    }
    const items = coerceArrayItems(spec, data.arrays[key] ?? '');
    if (items.length > 0) {
      setInObj(config, path, items);
    } else {
      deleteInObj(config, path);
    }
  }
}

function applyRawEdits(config: Record<string, unknown>, { rawKeys, showRaw, data, dirty }: BuildArgs): void {
  if (!(showRaw && Boolean(dirty.raw))) {
    return;
  }
  const parsedRaw = parseRawSection(showRaw, data.raw);
  // Invalid YAML → null: keep the existing raw keys rather than wiping them (the editor shows the error).
  if (!parsedRaw) {
    return;
  }
  for (const key of rawKeys) {
    delete config[key];
  }
  Object.assign(config, parsedRaw);
}

// The entry's `label`, as an object to start the entry from (`{}` when there is none).
function entryLabel({ data, value, requireLabel }: BuildArgs): Record<string, unknown> {
  const typed = data.label.trim();
  if (typed) {
    return { label: typed };
  }
  // Clearing a resource's label would strand its `resource:` references — keep the saved label.
  if (requireLabel === true && typeof value.label === 'string' && value.label) {
    return { label: value.label };
  }
  return {};
}

// The existing config with the user's edits overlaid: raw section first, then the form fields.
function editedConfig(args: BuildArgs): Record<string, unknown> {
  const config: Record<string, unknown> = structuredClone(args.inner);
  applyRawEdits(config, args);
  applyScalarEdits(config, args.leaves.scalars, args.data, args.dirty);
  applyArrayEdits(config, args.leaves.arrays, args.data, args.dirty);
  pruneEmptyObjects(config);
  return config;
}

// Assemble the component entry: start from the existing config (so unrendered and untouched
// fields round-trip byte-for-byte) and overlay only the fields the user actually changed.
function buildComponentEntry(args: BuildArgs): Record<string, unknown> {
  const { componentName, value } = args;
  const next = entryLabel(args);
  const original = value[componentName];
  // A list/scalar-valued component (switch/try/catch/for_each): preserve the value verbatim and only
  // patch the label — rebuilding would write `{}` over the array and drop the children.
  if (!isObject(original) || Array.isArray(original)) {
    next[componentName] = original ?? {};
    return next;
  }
  next[componentName] = editedConfig(args);
  return next;
}

// Render one field: scalar, scalar list, or nested object group; complex fields go to the raw section.
const SchemaField = ({ spec, path, control }: { spec: RawFieldSpec; path: string[]; control: Control<FormValues> }) => {
  const here = [...path, spec.name];
  const lintSignatureInside = useLintErrorSignatureUnder(here);
  if (isScalarField(spec)) {
    return <ScalarField control={control} leaf={{ spec, path: here, key: here.join('/') }} />;
  }
  if (isScalarArrayField(spec)) {
    return <ArrayField control={control} leaf={{ spec, path: here, key: here.join('/') }} />;
  }
  if (isObjectGroupField(spec)) {
    return (
      <FieldGroup
        defaultOpen={checkRequired(spec) && !spec.advanced}
        forceOpenSignal={lintSignatureInside}
        label={spec.name}
      >
        {/* Errors anchored on the group itself (e.g. `batching: null`) — shown where it's fixed. */}
        <FieldLintErrorList dirty={false} fieldKey={here.join('/')} />
        <SchemaFields control={control} fields={spec.children ?? []} path={here} />
      </FieldGroup>
    );
  }
  return null;
};

// "Optional" only means something in contrast to required fields above it — with none, the label
// reads as "nothing here matters", which lint errors then contradict; render the fields plainly.
const OptionalFieldsSection = ({
  fields,
  hasRequired,
  control,
}: {
  fields: RawFieldSpec[];
  hasRequired: boolean;
  control: Control<FormValues>;
}) => {
  if (fields.length === 0) {
    return null;
  }
  const rendered = fields.map((f) => <SchemaField control={control} key={f.name} path={[]} spec={f} />);
  return hasRequired ? <FieldGroup label="Optional">{rendered}</FieldGroup> : rendered;
};

type FieldGroupKey = 'required' | 'optional' | 'advanced';

// Display buckets; `advanced` wins over `required`, so an advanced+required field stays below the fold.
const fieldGroupKey = (spec: RawFieldSpec): FieldGroupKey => {
  if (spec.advanced) {
    return 'advanced';
  }
  if (checkRequired(spec)) {
    return 'required';
  }
  return 'optional';
};

function groupFormFields(fields: RawFieldSpec[]): Record<FieldGroupKey, RawFieldSpec[]> {
  const groups: Record<FieldGroupKey, RawFieldSpec[]> = { required: [], optional: [], advanced: [] };
  for (const spec of fields) {
    // isFormField excludes deprecated fields; their existing values surface in the raw-YAML section.
    if (isFormField(spec)) {
      groups[fieldGroupKey(spec)].push(spec);
    }
  }
  return groups;
}

const SchemaFields = ({
  fields,
  path,
  control,
}: {
  fields: RawFieldSpec[];
  path: string[];
  control: Control<FormValues>;
}) => {
  const { required, optional, advanced } = groupFormFields(fields);
  const ordered = [...required, ...optional, ...advanced];
  return (
    <>
      {ordered.map((f) => (
        <SchemaField control={control} key={f.name} path={path} spec={f} />
      ))}
    </>
  );
};

type NodeConfigFormProps = {
  spec: ConnectComponentSpec;
  componentName: string;
  /** The full component entry, e.g. `{ label, kafka: {...} }`. */
  value: Record<string, unknown>;
  /** Existing resource labels offered by `resource:` dropdowns. */
  resourceLabels?: Record<ResourceKind, string[]>;
  /** Create a new resource of a kind and link it to the field being edited. */
  onCreateResource?: (kind: ResourceKind) => void;
  /** Rendered at the top of the scroll area, so it scrolls with the form rather than sticking above it. */
  headerSlot?: React.ReactNode;
  /** A control-flow component's direct children (cases / steps), shown as a clickable list. */
  childItems?: InspectorChildItem[];
  onSelectChild?: (item: InspectorChildItem) => void;
  /** Reports the assembled config on change (null when clean) so the inspector can auto-commit on leave/save. */
  onConfigChange?: (config: Record<string, unknown> | null) => void;
  /**
   * Flushes the reported draft into the YAML immediately; returns whether it was applied. When
   * provided, the form commits on field blur / ⌘⏎ / its Apply button — not just on node-leave —
   * so the canvas and lint react per field.
   */
  onCommitField?: () => boolean;
  /** Lint messages anchored to field keys (see mapLintHintsToFields), rendered under their fields. */
  fieldErrors?: FieldLintErrors;
  /** Opens the Add-topic dialog for this node; offered by topic-named fields. */
  onCreateTopic?: () => void;
  /** Resource nodes are referenced by label — the label field must not be cleared. */
  requireLabel?: boolean;
};

const NO_FIELD_ERRORS: FieldLintErrors = new Map();

// What the form edits, derived from the schema and the saved component value.
type FormModel = {
  inner: Record<string, unknown>;
  // A list-valued component (switch/try/catch/for_each) is edited on the canvas, not via object
  // fields — rendering them would mislead and saving would clobber the array. Show a hint instead.
  isListValued: boolean;
  leaves: Leaves;
  rawKeys: string[];
  showRaw: boolean;
  rawObject: Record<string, unknown>;
};

// Keys the raw-YAML fallback owns: complex (or deprecated) schema fields and keys the schema
// doesn't know. Nested-component fields are preserved untouched (the form clones the config).
function rawSectionKeys(fields: RawFieldSpec[], inner: Record<string, unknown>): string[] {
  const schemaKeys = new Set(
    fields.flatMap((f) => {
      const schemaKey = f.name;
      return Boolean(schemaKey) ? [schemaKey] : [];
    })
  );
  const complexSchemaKeys = fields.flatMap((f) =>
    f.name && (f.deprecated || !(isFormField(f) || isComponentField(f))) ? [f.name] : []
  );
  const unknownKeys = Object.keys(inner).filter((k) => !schemaKeys.has(k));
  return [...new Set([...complexSchemaKeys, ...unknownKeys])].filter((k) => inner[k] !== undefined);
}

// Leaves drive form defaults + assembly; everything else round-trips through the raw section.
function deriveFormModel(fields: RawFieldSpec[], componentValue: unknown): FormModel {
  const isListValued = Array.isArray(componentValue);
  const inner = isObject(componentValue) && !isListValued ? componentValue : {};
  const rawKeys = rawSectionKeys(fields, inner);
  return {
    inner,
    isListValued,
    leaves: collectLeaves(fields),
    rawKeys,
    showRaw: rawKeys.length > 0,
    rawObject: Object.fromEntries(rawKeys.map((k) => [k, inner[k]])),
  };
}

function buildFormValues(value: Record<string, unknown>, { inner, leaves, showRaw, rawObject }: FormModel): FormValues {
  return {
    label: typeof value.label === 'string' ? value.label : '',
    raw: showRaw ? yamlStringify(rawObject) : '',
    fields: Object.fromEntries(leaves.scalars.map((l) => [l.key, initialScalar(l.spec, getInObj(inner, l.path))])),
    arrays: Object.fromEntries(
      leaves.arrays.map((l) => {
        const v = getInObj(inner, l.path);
        return [l.key, Array.isArray(v) ? v.join('\n') : ''];
      })
    ),
  };
}

// The values a successful commit leaves as the form's baseline. Edits the save path deliberately
// skipped (malformed numerics, invalid raw YAML) keep their SAVED value as the baseline so they
// stay dirty — otherwise the clean-form resync would silently revert them.
function committedBaseline(current: FormValues, { inner, leaves, showRaw, rawObject }: FormModel): FormValues {
  const committed: FormValues = { ...current, fields: { ...current.fields } };
  for (const leaf of leaves.scalars) {
    if (isNonEmptyString(numericHint(leaf.spec, current.fields[leaf.key]))) {
      committed.fields[leaf.key] = initialScalar(leaf.spec, getInObj(inner, leaf.path));
    }
  }
  if (showRaw && current.raw.trim() !== '' && parseRawSection(true, current.raw) === null) {
    committed.raw = yamlStringify(rawObject);
  }
  return committed;
}

type NodeConfigDraftArgs = Pick<
  NodeConfigFormProps,
  'componentName' | 'value' | 'onConfigChange' | 'onCommitField' | 'requireLabel'
> & {
  model: FormModel;
};

// The form state behind NodeConfigForm: re-syncs from external writes, reports the assembled
// draft, and flushes it per field.
function useNodeConfigDraft({
  componentName,
  value,
  model,
  onConfigChange,
  onCommitField,
  requireLabel,
}: NodeConfigDraftArgs) {
  const { control, formState, getValues, reset } = useForm<FormValues>({
    defaultValues: buildFormValues(value, model),
  });

  // Read dirtyFields/isDirty during render so react-hook-form subscribes to (and
  // keeps updating) them — otherwise they stay empty and every field looks untouched.
  const { dirtyFields, isDirty } = formState;

  // External writes while the form is open (a field-blur commit round-tripping through the YAML,
  // the Topic/User pill dialogs, resource linking) change `value` without remounting. A clean form
  // re-syncs in place — no remount, so focus and scroll survive; a dirty form keeps the user's
  // edits and re-syncs when it next becomes clean, so a write that landed mid-edit isn't lost.
  const serializedValue = JSON.stringify(value);
  const syncedValueRef = useRef(serializedValue);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `serializedValue`/`isDirty` are the triggers; values rebuild from the latest props.
  useEffect(() => {
    if (!isDirty && syncedValueRef.current !== serializedValue) {
      syncedValueRef.current = serializedValue;
      reset(buildFormValues(value, model));
    }
  }, [serializedValue, isDirty]);

  const watched = useWatch({ control });
  // `serializedValue` is a trigger too: an external write while dirty (create-topic patch) must
  // rebuild the draft from the fresh value, or flushing it later would clobber that write.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `watched`/`serializedValue` are the change triggers; the config is rebuilt from the latest values/props read in the body.
  useEffect(() => {
    onConfigChange?.(
      isDirty
        ? buildComponentEntry({
            componentName,
            value,
            inner: model.inner,
            leaves: model.leaves,
            rawKeys: model.rawKeys,
            showRaw: model.showRaw,
            data: getValues(),
            dirty: dirtyFields,
            requireLabel,
          })
        : null
    );
  }, [watched, isDirty, getValues, onConfigChange, serializedValue]);

  // Flush the draft into the YAML now (field blur / ⌘⏎ / Apply). On success the committed values
  // become the form's new baseline in place — no remount, focus and scroll survive.
  const commitNow = () => {
    if (!(onCommitField && isDirty && onCommitField())) {
      return;
    }
    reset(committedBaseline(getValues(), model), { keepDirtyValues: true });
  };

  return { control, isDirty, commitNow };
}

function resourceFieldContextFor({
  spec,
  componentName,
  resourceLabels,
  onCreateResource,
  onCreateTopic,
}: Pick<
  NodeConfigFormProps,
  'spec' | 'componentName' | 'resourceLabels' | 'onCreateResource' | 'onCreateTopic'
>): ResourceFieldContextValue {
  const clusterTopicFields = REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(componentName);
  return {
    labels: resourceLabels ?? { cache: [], rate_limit: [] },
    onCreateResource,
    componentResourceKind: resourceKindForComponentName(componentName),
    clusterTopicFields,
    onCreateTopic: clusterTopicFields ? onCreateTopic : undefined,
    fieldDocsUrl: (path) => getFieldDocsUrl(spec.type, componentName, path),
  };
}

// The lint errors anchored anywhere under these fields, as one signature (see lintErrorSignatureUnder).
function lintErrorSignatureUnderFields(errors: FieldLintErrors, fields: RawFieldSpec[]): string {
  return fields
    .flatMap((f) => {
      const fieldErrorSignature = lintErrorSignatureUnder(errors, f.name);
      return Boolean(fieldErrorSignature) ? [fieldErrorSignature] : [];
    })
    .join('\n');
}

// A control-flow component's direct children, when there are any and a way to open them.
type ChildList = { items: InspectorChildItem[]; onSelect: (item: InspectorChildItem) => void };

const LabelField = ({ control, requireLabel }: { control: Control<FormValues>; requireLabel?: boolean }) => {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={labelId}>label</Label>
      <Controller
        control={control}
        name="label"
        render={({ field, fieldState }) => (
          <>
            <Input
              aria-required={(requireLabel ?? false) || undefined}
              id={labelId}
              onChange={field.onChange}
              placeholder={
                requireLabel === true
                  ? 'Name other nodes use to reference this resource'
                  : 'Optional identifier for this component'
              }
              value={field.value}
            />
            {requireLabel === true && !field.value.trim() ? (
              <div className="text-body-sm text-destructive">
                A resource needs a label — nodes reference it by name. The saved label is kept.
              </div>
            ) : null}
            <FieldLintErrorList dirty={fieldState.isDirty} fieldKey="label" />
          </>
        )}
      />
    </div>
  );
};

// A list-valued component's items are edited on the canvas: list them, or say where they live.
const ListValuedItems = ({ childList }: { childList?: ChildList }) =>
  childList ? (
    <ChildItemsList {...childList} label="Cases" />
  ) : (
    <div className="rounded-md border border-dashed border-border/60 px-3 py-2">
      <div className="text-body-sm text-muted-foreground">
        This component's items (cases / processors) are edited on the canvas — select one to edit it.
      </div>
    </div>
  );

const RawSettingsGroup = ({ control }: { control: Control<FormValues> }) => (
  <FieldGroup defaultOpen={false} label="Other settings (YAML)">
    <Controller
      control={control}
      name="raw"
      render={({ field }) => {
        const invalid = field.value.trim() !== '' && parseRawSection(true, field.value) === null;
        return (
          <div className="flex flex-col gap-1.5">
            <div className="h-[450px] overflow-hidden rounded-md border border-border">
              <YamlEditor
                onChange={(v) => field.onChange((v ?? '') || '')}
                options={{ minimap: { enabled: false } }}
                transparentBackground
                value={field.value}
              />
            </div>
            {invalid ? (
              <div className="text-body-sm text-destructive">
                Invalid YAML — these settings won't be saved until fixed.
              </div>
            ) : null}
          </div>
        );
      }}
    />
  </FieldGroup>
);

// Required fields, then Optional and Advanced groups, nested-component Steps, and the raw-YAML
// fallback. A fragment: the sections are direct children of the scroll area's vertical rhythm.
const SchemaSections = ({
  control,
  fields,
  childList,
  showRaw,
}: {
  control: Control<FormValues>;
  fields: RawFieldSpec[];
  childList?: ChildList;
  showRaw: boolean;
}) => {
  const errors = useContext(FieldLintErrorsContext);
  const { required, optional, advanced } = groupFormFields(fields);
  // Nested-component fields are their own canvas nodes — offered as a clickable "Steps" list, never inline.
  const hasComponentFields = fields.some(isComponentField);
  return (
    <>
      {required.map((f) => (
        <SchemaField control={control} key={f.name} path={[]} spec={f} />
      ))}
      <OptionalFieldsSection control={control} fields={optional} hasRequired={required.length > 0} />
      {advanced.length > 0 ? (
        <FieldGroup
          defaultOpen={false}
          forceOpenSignal={lintErrorSignatureUnderFields(errors, advanced)}
          label="Advanced"
        >
          {advanced.map((f) => (
            <SchemaField control={control} key={f.name} path={[]} spec={f} />
          ))}
        </FieldGroup>
      ) : null}
      {hasComponentFields && childList ? <ChildItemsList {...childList} label="Steps" /> : null}
      {showRaw ? <RawSettingsGroup control={control} /> : null}
    </>
  );
};

// Edits normally apply on field blur; this is the visible pending state plus a manual trigger
// (and ⌘⏎) for applying without moving focus.
export const PendingEditsBar = ({ onApply }: { onApply: () => void }) => (
  <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2">
    <span className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
      <span aria-hidden className="size-1.5 rounded-full bg-informative" />
      Unsaved edits
    </span>
    <ElementTooltip content="Apply now (⌘⏎) — edits also apply when you leave a field">
      <Button onClick={onApply} size="sm" type="button" variant="primary">
        Apply
      </Button>
    </ElementTooltip>
  </div>
);

export const isCommitShortcut = (e: React.KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.key === 'Enter';

export function NodeConfigForm(props: NodeConfigFormProps) {
  const { spec, componentName, value, headerSlot, childItems, onSelectChild, onCommitField, fieldErrors } = props;
  const fields = spec.config?.children ?? [];
  const model = deriveFormModel(fields, value[componentName]);
  const childList: ChildList | undefined =
    childItems && childItems.length > 0 && onSelectChild ? { items: childItems, onSelect: onSelectChild } : undefined;
  const { control, isDirty, commitNow } = useNodeConfigDraft({ ...props, model });

  return (
    <ResourceFieldContext.Provider value={resourceFieldContextFor(props)}>
      <FieldLintErrorsContext.Provider value={fieldErrors ?? NO_FIELD_ERRORS}>
        {/* Committing per FIELD (not per node): the container listens for focus leaving any field
            (bubbled focusout) and ⌘⏎, flushing the draft so the canvas card and lint react while
            the node is still selected. It is not itself interactive — the fields inside are. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: passive listener for events bubbling from the form controls. */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: passive listener for events bubbling from the form controls. */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          onBlur={onCommitField ? commitNow : undefined}
          onKeyDown={
            onCommitField
              ? (e) => {
                  if (isCommitShortcut(e)) {
                    e.preventDefault();
                    commitNow();
                  }
                }
              : undefined
          }
        >
          <ScrollShadow contentClassName="space-y-4 px-4 py-4">
            {/* Full-bleed to the scroll edges; padded fields follow. */}
            {Boolean(headerSlot) ? <div className="-mx-4 -mt-4">{headerSlot}</div> : null}
            <LabelField control={control} requireLabel={props.requireLabel} />
            {model.isListValued ? (
              <ListValuedItems childList={childList} />
            ) : (
              <SchemaSections childList={childList} control={control} fields={fields} showRaw={model.showRaw} />
            )}
          </ScrollShadow>
          {onCommitField && isDirty ? <PendingEditsBar onApply={commitNow} /> : null}
        </div>
      </FieldLintErrorsContext.Provider>
    </ResourceFieldContext.Provider>
  );
}
