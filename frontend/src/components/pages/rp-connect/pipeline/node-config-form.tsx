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

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { createContext, useContext, useEffect, useId } from 'react';
import { type Control, Controller, type FieldPath, useForm, useWatch } from 'react-hook-form';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';

import { ScrollShadow } from './scroll-shadow';
import { getSecretSyntax } from '../types/constants';
import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';
import {
  checkRequired,
  fieldHasOptions,
  isComponentField,
  isFormField,
  isObjectGroupField,
  isScalarArrayField,
  isScalarField,
} from '../utils/schema';
import type { EditTarget, ResourceKind } from '../utils/yaml';
import { resourceKindForComponentName } from '../utils/yaml';

// Re-exported for node-inspector, which imports ResourceKind from here.
export type { ResourceKind } from '../utils/yaml';

// A direct child (case / step) of a control-flow component, shown as a clickable row to jump
// from the high-level construct to the child node's full config.
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
  if (item.condition) {
    return `if ${item.condition}`;
  }
  if (item.isDefault) {
    return 'default';
  }
  if (item.isErrorPath) {
    return 'on error';
  }
  return;
};

const childItemCondColor = (item: InspectorChildItem): string => {
  if (item.isErrorPath) {
    return 'text-destructive';
  }
  if (item.isDefault) {
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
    <button
      className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-left outline-none transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      onClick={() => onSelect(item)}
      type="button"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {condText ? (
          <Text
            as="span"
            className={cn('truncate font-mono', childItemCondColor(item))}
            title={condText}
            variant="captionStrongSmall"
          >
            {condText}
          </Text>
        ) : null}
        <Text as="span" className="truncate" title={item.name} variant="bodyStrongMedium">
          {item.name}
        </Text>
      </div>
      {item.lintCount ? <CountDot count={item.lintCount} size="sm" variant="error" /> : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
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
  // A heading, not a <label>: these rows are navigation buttons, so there's no single control for
  // an htmlFor to associate with, and each button already carries its own accessible text.
  <div className="flex flex-col gap-1.5">
    <Text className="font-medium" variant="bodyStrongMedium">
      {label}
    </Text>
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <ChildItemRow item={item} key={item.id} onSelect={onSelect} />
      ))}
    </div>
    <Text className="text-muted-foreground" variant="bodySmall">
      Select one to open its full configuration.
    </Text>
  </div>
);

// Resource-link context (existing labels + create-and-link action), provided by the inspector
// so the form itself stays a pure config editor.
type ResourceFieldContextValue = {
  labels: Record<ResourceKind, string[]>;
  onCreateResource?: (kind: ResourceKind) => void;
  // Kind of the component being edited, so a plainly-typed `resource:` string field is still
  // recognised as a link.
  componentResourceKind?: ResourceKind;
};
const ResourceFieldContext = createContext<ResourceFieldContextValue>({ labels: { cache: [], rate_limit: [] } });

const CREATE_RESOURCE_VALUE = '__create_resource__';

// Resolve which resource kind a field links to: by field type, or — for a field named `resource`
// — the kind of the cache/rate_limit component it sits in (some schemas type it as a plain string).
function resolveResourceKind(spec: RawFieldSpec, componentResourceKind?: ResourceKind): ResourceKind | undefined {
  if (spec.type === 'cache' || spec.type === 'rate_limit') {
    return spec.type;
  }
  if (spec.name === 'resource' && spec.kind === 'scalar' && componentResourceKind) {
    return componentResourceKind;
  }
  return;
}

// A typed dropdown for a `resource:` link: pick an existing label or create-and-link a new one.
// Never free text, so the reference can't be mistyped. An unknown value (stale link) is still
// shown, flagged missing.
const ResourceReferenceSelect = ({
  kind,
  value = '',
  onChange,
  id,
}: {
  kind: ResourceKind;
  value?: string;
  onChange: (value: unknown) => void;
  id?: string;
}) => {
  const { labels, onCreateResource } = useContext(ResourceFieldContext);
  const options = labels[kind];
  const isMissing = value !== '' && !options.includes(value);
  return (
    <Select
      onValueChange={(v) => {
        if (v === CREATE_RESOURCE_VALUE) {
          onCreateResource?.(kind);
          return;
        }
        onChange(v);
      }}
      value={value}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Select a resource…" />
      </SelectTrigger>
      <SelectContent>
        {isMissing ? <SelectItem value={value}>{value} (missing)</SelectItem> : null}
        {options.map((label) => (
          <SelectItem key={label} value={label}>
            {label}
          </SelectItem>
        ))}
        {onCreateResource ? (
          <SelectItem value={CREATE_RESOURCE_VALUE}>
            <span className="flex items-center gap-1.5 text-primary">
              <Plus className="size-3.5" />
              Create new {kind === 'cache' ? 'cache' : 'rate limit'}…
            </span>
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
};

// Path helpers for the plain-JSON config object (not the YAML AST).
function getInObj(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') {
      return;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function setInObj(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let cur = obj;
  for (const key of path.slice(0, -1)) {
    if (!cur[key] || typeof cur[key] !== 'object' || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path.at(-1) as string] = value;
}

function deleteInObj(obj: Record<string, unknown>, path: string[]): void {
  const parent = path.slice(0, -1).reduce<Record<string, unknown> | undefined>((cur, key) => {
    const next = cur?.[key];
    return next && typeof next === 'object' ? (next as Record<string, unknown>) : undefined;
  }, obj);
  if (parent) {
    delete parent[path.at(-1) as string];
  }
}

// Drop objects that became empty after clearing their fields, so the YAML stays tidy.
function pruneEmptyObjects(obj: Record<string, unknown>): void {
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      pruneEmptyObjects(val as Record<string, unknown>);
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
  // Interpolations (`${ENV}`, secrets, Bloblang) are valid even in numeric fields — keep verbatim
  // rather than coercing to NaN (→ '' → dropped on commit). Matches numericHint.
  if ((spec.type === 'int' || spec.type === 'float') && text.includes('${')) {
    return text;
  }
  if (spec.type === 'int') {
    const n = Number.parseInt(text, 10);
    return Number.isNaN(n) ? '' : n;
  }
  if (spec.type === 'float') {
    const n = Number(text);
    return text === '' || Number.isNaN(n) ? '' : n;
  }
  return text;
}

function coerceArrayItems(spec: RawFieldSpec, text: string): unknown[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (spec.type === 'int' || spec.type === 'float') {
    return lines.map(Number).filter((n) => !Number.isNaN(n));
  }
  return lines;
}

type Leaf = { spec: RawFieldSpec; path: string[]; key: string };

/** All scalar + scalar-array leaves (recursing into object groups), keyed by path. */
function collectLeaves(fields: RawFieldSpec[], base: string[] = []): { scalars: Leaf[]; arrays: Leaf[] } {
  const scalars: Leaf[] = [];
  const arrays: Leaf[] = [];
  for (const f of fields) {
    const path = [...base, f.name];
    const leaf: Leaf = { spec: f, path, key: path.join('/') };
    if (isScalarField(f)) {
      scalars.push(leaf);
    } else if (isScalarArrayField(f)) {
      arrays.push(leaf);
    } else if (isObjectGroupField(f)) {
      const nested = collectLeaves(f.children ?? [], path);
      scalars.push(...nested.scalars);
      arrays.push(...nested.arrays);
    }
  }
  return { scalars, arrays };
}

type FormValues = {
  label: string;
  raw: string;
  fields: Record<string, string | boolean>;
  arrays: Record<string, string>;
};

// Parse the "Other settings (YAML)" text: the mapping, `{}` when empty (intentional clear), or
// `null` when invalid / not a mapping — so callers preserve existing keys instead of wiping them.
function parseRawSection(showRaw: boolean, raw: string): Record<string, unknown> | null {
  if (!(showRaw && raw.trim())) {
    return {};
  }
  try {
    const parsed = parseYaml(raw);
    // Empty / comments-only parses to nullish — treat as an intentional clear, not invalid.
    if (parsed === null || parsed === undefined) {
      return {};
    }
    return typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
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
  leaves: { scalars: Leaf[]; arrays: Leaf[] };
  rawKeys: string[];
  showRaw: boolean;
  data: FormValues;
  dirty: DirtyState;
  /** Resources are referenced by label — never drop it, even if the field is cleared. */
  requireLabel?: boolean;
};

function applyScalarEdits(config: Record<string, unknown>, scalars: Leaf[], data: FormValues, dirty: DirtyState): void {
  for (const { spec, path, key } of scalars) {
    if (!dirty.fields?.[key]) {
      continue;
    }
    // A malformed numeric literal is flagged and NOT committed — coercing would silently truncate
    // (`10x` → 10) or drop it; the saved value is kept until fixed.
    if (numericHint(spec, data.fields[key])) {
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
    if (!dirty.arrays?.[key]) {
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

// Assemble the component entry: start from the existing config (so unrendered and untouched
// fields round-trip byte-for-byte) and overlay only the fields the user actually changed.
function buildComponentEntry({
  componentName,
  value,
  inner,
  leaves,
  rawKeys,
  showRaw,
  data,
  dirty,
  requireLabel,
}: BuildArgs): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (data.label.trim()) {
    next.label = data.label.trim();
  } else if (requireLabel && typeof value.label === 'string' && value.label) {
    // Clearing a resource's label would strand every `resource: <label>` reference —
    // keep the saved label (the field shows an inline explanation).
    next.label = value.label;
  }

  const original = value[componentName];
  // A component whose value isn't a plain object — a `switch`/`try`/`catch`/`for_each` list, or a
  // scalar. The object-field form can't model these, so preserve the value verbatim and only patch
  // the label; rebuilding would write `{}` over the array and drop the children.
  if (!(original && typeof original === 'object') || Array.isArray(original)) {
    next[componentName] = original ?? {};
    return next;
  }

  const config: Record<string, unknown> = structuredClone(inner);
  if (showRaw && dirty.raw) {
    const parsedRaw = parseRawSection(showRaw, data.raw);
    // Invalid YAML → null: keep the existing raw keys rather than wiping them (the editor shows the error).
    if (parsedRaw) {
      for (const key of rawKeys) {
        delete config[key];
      }
      Object.assign(config, parsedRaw);
    }
  }

  applyScalarEdits(config, leaves.scalars, data, dirty);
  applyArrayEdits(config, leaves.arrays, data, dirty);
  pruneEmptyObjects(config);

  next[componentName] = config;
  return next;
}

const FieldLabel = ({ spec, htmlFor }: { spec: RawFieldSpec; htmlFor?: string }) => (
  <div className="flex items-center gap-2">
    <Label className="font-medium text-sm" htmlFor={htmlFor}>
      {spec.name}
    </Label>
    {checkRequired(spec) ? (
      <span aria-hidden className="text-destructive text-xs" title="Required">
        *
      </span>
    ) : null}
    {spec.type && spec.type !== 'string' ? <span className="text-muted-foreground text-xs">{spec.type}</span> : null}
    {spec.defaultValue ? (
      <span className="text-muted-foreground text-xs">
        default: <span className="font-mono">{spec.defaultValue}</span>
      </span>
    ) : null}
  </div>
);

const FieldDescription = ({ spec }: { spec: RawFieldSpec }) =>
  spec.description ? (
    <Text className="text-muted-foreground" variant="bodySmall">
      {spec.description}
    </Text>
  ) : null;

// Field names that plausibly hold credentials — masked by default so a screen-share
// doesn't leak them (the schema has no secret flag, so this is a name heuristic).
const SECRET_NAME_RE = /(password|secret|token|private_key|api_key|passphrase)$/i;

const isSecretField = (spec: RawFieldSpec): boolean =>
  spec.type === 'string' && !fieldHasOptions(spec) && SECRET_NAME_RE.test(spec.name ?? '');

// A masked credential input. `type="password"` gives the registry Input's built-in reveal toggle;
// a `${…}` value is an interpolation, not a literal credential, so it's shown in the clear (and the
// toggle drops away with type="text").
const SecretInput = (props: { id?: string; value: string; onChange: (value: unknown) => void; required?: boolean }) => (
  <Input
    aria-required={props.required || undefined}
    autoComplete="off"
    id={props.id}
    onChange={props.onChange}
    type={props.value.includes('${') ? 'text' : 'password'}
    value={props.value}
  />
);

const ScalarControl = ({
  spec,
  value,
  onChange,
  id,
  invalid,
}: {
  spec: RawFieldSpec;
  value: string | boolean;
  onChange: (value: unknown) => void;
  id?: string;
  invalid?: boolean;
}) => {
  const { componentResourceKind } = useContext(ResourceFieldContext);
  const required = checkRequired(spec);
  if (spec.type === 'bool') {
    return <Switch aria-label={spec.name} checked={Boolean(value)} id={id} onCheckedChange={onChange} />;
  }
  const resourceKind = resolveResourceKind(spec, componentResourceKind);
  if (resourceKind) {
    return <ResourceReferenceSelect id={id} kind={resourceKind} onChange={onChange} value={String(value ?? '')} />;
  }
  if (fieldHasOptions(spec)) {
    return (
      <Select onValueChange={onChange} value={String(value ?? '')}>
        <SelectTrigger aria-label={spec.name} aria-required={required || undefined} id={id}>
          <SelectValue placeholder={spec.defaultValue || 'Select…'} />
        </SelectTrigger>
        <SelectContent>
          {spec.annotatedOptions?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (isSecretField(spec)) {
    return <SecretInput id={id} onChange={onChange} required={required} value={String(value ?? '')} />;
  }
  // Numeric fields use a text input with numeric inputMode, not type="number": a number input
  // blanks any value the browser can't parse (e.g. `1000$`), hiding it. Text keeps malformed
  // values visible and fixable.
  const numericMode = spec.type === 'int' ? 'numeric' : 'decimal';
  return (
    <Input
      aria-invalid={invalid || undefined}
      aria-required={required || undefined}
      id={id}
      inputMode={spec.type === 'int' || spec.type === 'float' ? numericMode : undefined}
      onChange={onChange}
      placeholder={spec.defaultValue || spec.examples?.[0] || undefined}
      type="text"
      value={String(value ?? '')}
    />
  );
};

const INT_VALUE_RE = /^-?\d+$/;

// A non-blocking validity hint for numeric fields. `${…}` values are interpolations (env vars,
// secrets, Bloblang) — legitimate anywhere — so only plainly malformed literals are flagged.
function numericHint(spec: RawFieldSpec, value: string | boolean): string | null {
  const text = String(value ?? '').trim();
  if (text === '' || typeof value === 'boolean' || text.includes('${')) {
    return null;
  }
  if (spec.type === 'int' && !INT_VALUE_RE.test(text)) {
    return "Not a valid integer — this change won't be saved until fixed.";
  }
  if (spec.type === 'float' && Number.isNaN(Number(text))) {
    return "Not a valid number — this change won't be saved until fixed.";
  }
  return null;
}

const SECRET_REF_EXAMPLE = getSecretSyntax('MY_SECRET');

const ScalarField = ({ leaf, control }: { leaf: Leaf; control: Control<FormValues> }) => {
  const inputId = useId();
  return (
    <Controller
      control={control}
      name={`fields.${leaf.key}` as FieldPath<FormValues>}
      render={({ field }) => {
        const hint = numericHint(leaf.spec, field.value as string | boolean);
        const showSecretTip = isSecretField(leaf.spec) && !String(field.value ?? '').includes('${');
        return (
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={inputId} spec={leaf.spec} />
            <ScalarControl
              id={inputId}
              invalid={Boolean(hint)}
              onChange={field.onChange}
              spec={leaf.spec}
              value={field.value as string | boolean}
            />
            {hint ? (
              <Text className="text-destructive" variant="bodySmall">
                {hint}
              </Text>
            ) : null}
            {showSecretTip ? (
              <Text className="text-muted-foreground" variant="bodySmall">
                Tip: reference a secret (<span className="font-mono">{SECRET_REF_EXAMPLE}</span>) instead of a literal
                value.
              </Text>
            ) : null}
            <FieldDescription spec={leaf.spec} />
          </div>
        );
      }}
    />
  );
};

const ArrayField = ({ leaf, control }: { leaf: Leaf; control: Control<FormValues> }) => {
  const inputId = useId();
  return (
    <Controller
      control={control}
      name={`arrays.${leaf.key}` as FieldPath<FormValues>}
      render={({ field }) => (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={inputId} spec={leaf.spec} />
          <Textarea
            aria-required={checkRequired(leaf.spec) || undefined}
            className="font-mono text-sm"
            id={inputId}
            onChange={field.onChange}
            placeholder="One value per line"
            rows={3}
            value={String(field.value ?? '')}
          />
          <FieldDescription spec={leaf.spec} />
        </div>
      )}
    />
  );
};

const FieldGroup = ({
  label,
  defaultOpen = true,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => (
  <Collapsible className="rounded-md border border-border/60" defaultOpen={defaultOpen}>
    <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-left">
      <Text variant="bodyStrongMedium">{label}</Text>
      <ChevronDown
        className={cn('size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180')}
      />
    </CollapsibleTrigger>
    <CollapsibleContent className="flex flex-col gap-4 px-3 pt-1 pb-3">{children}</CollapsibleContent>
  </Collapsible>
);

// Render one field: a scalar, a scalar list, or a nested object sub-section
// (recursing through its children). Complex fields are skipped (handled by raw).
const SchemaField = ({ spec, path, control }: { spec: RawFieldSpec; path: string[]; control: Control<FormValues> }) => {
  const here = [...path, spec.name];
  if (isScalarField(spec)) {
    return <ScalarField control={control} leaf={{ spec, path: here, key: here.join('/') }} />;
  }
  if (isScalarArrayField(spec)) {
    return <ArrayField control={control} leaf={{ spec, path: here, key: here.join('/') }} />;
  }
  if (isObjectGroupField(spec)) {
    return (
      <FieldGroup defaultOpen={checkRequired(spec) && !spec.advanced} label={spec.name}>
        <SchemaFields control={control} fields={spec.children ?? []} path={here} />
      </FieldGroup>
    );
  }
  return null;
};

type FieldGroupKey = 'required' | 'optional' | 'advanced';

// Presentation buckets for a form's fields, in display order. `advanced` wins over `required`, so a
// field flagged advanced never sorts above the fold even when it's also required.
const fieldGroupKey = (spec: RawFieldSpec): FieldGroupKey =>
  spec.advanced ? 'advanced' : checkRequired(spec) ? 'required' : 'optional';

function groupFormFields(fields: RawFieldSpec[]): Record<FieldGroupKey, RawFieldSpec[]> {
  const groups: Record<FieldGroupKey, RawFieldSpec[]> = { required: [], optional: [], advanced: [] };
  for (const spec of fields) {
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
  /** Reports the assembled config as the form changes (null when clean), so the inspector can
      auto-commit on node-leave / save — no per-node Apply button. */
  onConfigChange?: (config: Record<string, unknown> | null) => void;
  /** Resource nodes are referenced by label — the label field must not be cleared. */
  requireLabel?: boolean;
};

export function NodeConfigForm({
  spec,
  componentName,
  value,
  resourceLabels,
  onCreateResource,
  headerSlot,
  childItems,
  onSelectChild,
  onConfigChange,
  requireLabel,
}: NodeConfigFormProps) {
  const labelId = useId();
  const hasChildList = Boolean(childItems && childItems.length > 0 && onSelectChild);
  const fields = spec.config?.children ?? [];
  const componentValue = value[componentName];
  // A list-valued component (switch/try/catch/for_each): its value is an array edited on the canvas,
  // not object fields. Rendering the schema fields here would mislead and saving would clobber the
  // array — show a hint instead.
  const isListValued = Array.isArray(componentValue);
  const inner =
    componentValue && typeof componentValue === 'object' && !isListValued
      ? (componentValue as Record<string, unknown>)
      : {};

  const { required, optional, advanced } = groupFormFields(fields);
  // Nested-component fields are their own canvas nodes, never inline controls — offered as a
  // clickable "Steps" list when this node owns them, otherwise edited directly on the canvas.
  const componentFields = fields.filter(isComponentField);

  // Leaves drive form defaults + assembly. Complex schema fields and unknown keys go to the
  // raw-YAML fallback; nested-component fields are preserved untouched (the form clones the config).
  const leaves = collectLeaves(fields);
  const schemaKeys = new Set(fields.map((f) => f.name).filter(Boolean));
  const complexSchemaKeys = fields.filter((f) => f.name && !(isFormField(f) || isComponentField(f))).map((f) => f.name);
  const unknownKeys = Object.keys(inner).filter((k) => !schemaKeys.has(k));
  const rawKeys = [...new Set([...complexSchemaKeys, ...unknownKeys])].filter((k) => inner[k] !== undefined);
  const showRaw = rawKeys.length > 0;
  const rawObject = Object.fromEntries(rawKeys.map((k) => [k, inner[k]]));

  const { control, formState, getValues } = useForm<FormValues>({
    defaultValues: {
      label: typeof value.label === 'string' ? value.label : '',
      raw: showRaw ? yamlStringify(rawObject) : '',
      fields: Object.fromEntries(leaves.scalars.map((l) => [l.key, initialScalar(l.spec, getInObj(inner, l.path))])),
      arrays: Object.fromEntries(
        leaves.arrays.map((l) => {
          const v = getInObj(inner, l.path);
          return [l.key, Array.isArray(v) ? v.join('\n') : ''];
        })
      ),
    },
  });

  // Read dirtyFields/isDirty during render so react-hook-form subscribes to (and
  // keeps updating) them — otherwise they stay empty and every field looks untouched.
  const { dirtyFields, isDirty } = formState;

  // Re-report the assembled config (null when clean) on every edit — see onConfigChange.
  const watched = useWatch({ control });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `watched` is the change trigger; the config is rebuilt from the latest values/props read in the body.
  useEffect(() => {
    onConfigChange?.(
      isDirty
        ? buildComponentEntry({
            componentName,
            value,
            inner,
            leaves,
            rawKeys,
            showRaw,
            data: getValues(),
            dirty: dirtyFields,
            requireLabel,
          })
        : null
    );
  }, [watched, isDirty, getValues, onConfigChange]);

  const resourceCtx: ResourceFieldContextValue = {
    labels: resourceLabels ?? { cache: [], rate_limit: [] },
    onCreateResource,
    componentResourceKind: resourceKindForComponentName(componentName),
  };

  return (
    <ResourceFieldContext.Provider value={resourceCtx}>
      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollShadow contentClassName="space-y-4 px-4 py-4">
          {/* Full-bleed to the scroll edges; padded fields follow. */}
          {headerSlot ? <div className="-mx-4 -mt-4">{headerSlot}</div> : null}
          <div className="flex flex-col gap-1.5">
            <Label className="font-medium text-sm" htmlFor={labelId}>
              label
            </Label>
            <Controller
              control={control}
              name="label"
              render={({ field }) => (
                <>
                  <Input
                    aria-required={requireLabel || undefined}
                    id={labelId}
                    onChange={field.onChange}
                    placeholder={
                      requireLabel
                        ? 'Name other nodes use to reference this resource'
                        : 'Optional identifier for this component'
                    }
                    value={field.value}
                  />
                  {requireLabel && !field.value.trim() ? (
                    <Text className="text-destructive" variant="bodySmall">
                      A resource needs a label — nodes reference it by name. The saved label is kept.
                    </Text>
                  ) : null}
                </>
              )}
            />
          </div>

          {isListValued && hasChildList ? (
            <ChildItemsList
              items={childItems as InspectorChildItem[]}
              label="Cases"
              onSelect={onSelectChild as (item: InspectorChildItem) => void}
            />
          ) : null}
          {isListValued && !hasChildList ? (
            <div className="rounded-md border border-border/60 border-dashed px-3 py-2">
              <Text className="text-muted-foreground" variant="bodySmall">
                This component's items (cases / processors) are edited on the canvas — select one to edit it.
              </Text>
            </div>
          ) : null}

          {isListValued ? null : required.map((f) => <SchemaField control={control} key={f.name} path={[]} spec={f} />)}

          {!isListValued && optional.length > 0 ? (
            <FieldGroup label="Optional">
              {optional.map((f) => (
                <SchemaField control={control} key={f.name} path={[]} spec={f} />
              ))}
            </FieldGroup>
          ) : null}

          {!isListValued && advanced.length > 0 ? (
            <FieldGroup defaultOpen={false} label="Advanced">
              {advanced.map((f) => (
                <SchemaField control={control} key={f.name} path={[]} spec={f} />
              ))}
            </FieldGroup>
          ) : null}

          {!isListValued && componentFields.length > 0 && hasChildList ? (
            <ChildItemsList
              items={childItems as InspectorChildItem[]}
              label="Steps"
              onSelect={onSelectChild as (item: InspectorChildItem) => void}
            />
          ) : null}

          {!isListValued && showRaw ? (
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
                          onChange={(v) => field.onChange(v || '')}
                          options={{ minimap: { enabled: false } }}
                          transparentBackground
                          value={field.value}
                        />
                      </div>
                      {invalid ? (
                        <Text className="text-destructive" variant="bodySmall">
                          Invalid YAML — these settings won't be saved until fixed.
                        </Text>
                      ) : null}
                    </div>
                  );
                }}
              />
            </FieldGroup>
          ) : null}
        </ScrollShadow>
      </div>
    </ResourceFieldContext.Provider>
  );
}
