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
import { AlertCircle, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { createContext, useContext, useEffect } from 'react';
import { type Control, Controller, type FieldPath, useForm, useWatch } from 'react-hook-form';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';

import { ScrollShadow } from './scroll-shadow';
import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';
import { checkRequired } from '../utils/schema';
import type { EditTarget, ResourceKind } from '../utils/yaml';

// Re-exported for node-inspector, which imports ResourceKind from here.
export type { ResourceKind } from '../utils/yaml';

// A direct child (case / step) of a control-flow component, shown in the inspector as a
// clickable row so you can jump from the high-level construct to the actual node's full config.
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

// Routing-condition text color: red for error paths, muted for default, the condition accent otherwise.
const childItemCondColor = (item: InspectorChildItem): string => {
  if (item.isErrorPath) {
    return 'text-destructive';
  }
  if (item.isDefault) {
    return 'text-muted-foreground';
  }
  return 'text-condition';
};

// One clickable child row: its routing condition over the component name, a lint count if
// any, and a chevron. Selecting it navigates the inspector to that node.
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
      className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
      onClick={() => onSelect(item)}
      type="button"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        {condText ? (
          <span className={cn('truncate font-medium font-mono text-[10px]', childItemCondColor(item))} title={condText}>
            {condText}
          </span>
        ) : null}
        <span className="truncate font-medium text-sm" title={item.name}>
          {item.name}
        </span>
      </span>
      {item.lintCount ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-destructive/40 bg-destructive/5 px-1.5 py-0.5 font-medium text-[10px] text-destructive">
          <AlertCircle className="size-3" />
          {item.lintCount}
        </span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
};

const ChildItemsList = ({
  items,
  onSelect,
  label,
}: {
  items: InspectorChildItem[];
  onSelect: (item: InspectorChildItem) => void;
  label: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label className="font-medium text-sm">{label}</Label>
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

// Resource-link context: the existing labels to offer and a create-and-link action.
// Provided by the inspector (which owns the full YAML) and consumed by resource-ref
// fields, so the form itself stays a pure config editor.
type ResourceFieldContextValue = {
  labels: Record<ResourceKind, string[]>;
  onCreateResource?: (kind: ResourceKind) => void;
  // The resource kind of the component being edited (cache/rate_limit processor), so a
  // plainly-typed `resource:` string field is still recognised as a link.
  componentResourceKind?: ResourceKind;
};
const ResourceFieldContext = createContext<ResourceFieldContextValue>({ labels: { cache: [], rate_limit: [] } });

const CREATE_RESOURCE_VALUE = '__create_resource__';

// Resolve which resource kind a field links to: by its field type, or — for a field
// literally named `resource` — the kind of the cache/rate_limit component it sits in
// (some schemas type the reference as a plain string).
function resolveResourceKind(spec: RawFieldSpec, componentResourceKind?: ResourceKind): ResourceKind | undefined {
  if (spec.type === 'cache' || spec.type === 'rate_limit') {
    return spec.type;
  }
  if (spec.name === 'resource' && spec.kind === 'scalar' && componentResourceKind) {
    return componentResourceKind;
  }
  return;
}

// A typed dropdown for a `resource:` link: pick an existing label or create-and-link a
// new resource. Never free text, so the reference can't be mistyped or dangle. A value
// that isn't among the known labels (e.g. a stale link) is still shown, flagged missing.
const ResourceReferenceSelect = ({
  kind,
  value,
  onChange,
}: {
  kind: ResourceKind;
  value: string;
  onChange: (value: unknown) => void;
}) => {
  const { labels, onCreateResource } = useContext(ResourceFieldContext);
  const options = labels[kind];
  const current = value ?? '';
  const isMissing = current !== '' && !options.includes(current);
  return (
    <Select
      onValueChange={(v) => {
        if (v === CREATE_RESOURCE_VALUE) {
          onCreateResource?.(kind);
          return;
        }
        onChange(v);
      }}
      value={current}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select a resource…" />
      </SelectTrigger>
      <SelectContent>
        {isMissing ? <SelectItem value={current}>{current} (missing)</SelectItem> : null}
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

const SCALAR_TYPES = new Set(['string', 'int', 'float', 'bool']);

function hasOptions(spec: RawFieldSpec): boolean {
  return (spec.annotatedOptions?.length ?? 0) > 0;
}

// A reference to a cache/rate_limit resource: a scalar string whose field type names
// the resource kind (not an inline component). Rendered as a label dropdown so the
// link can't be mistyped, and stored/assembled like any other scalar string.
function isResourceRefField(spec: RawFieldSpec): boolean {
  return (
    Boolean(spec.name) &&
    spec.kind === 'scalar' &&
    (spec.type === 'cache' || spec.type === 'rate_limit') &&
    !(spec.children?.length ?? 0)
  );
}

// A single editable value: a primitive (string/int/float/bool), an enum select, or a
// resource reference (stored as a string).
function isScalarField(spec: RawFieldSpec): boolean {
  return (
    Boolean(spec.name) &&
    spec.kind === 'scalar' &&
    (SCALAR_TYPES.has(spec.type) || hasOptions(spec) || isResourceRefField(spec))
  );
}

// A list of primitives (e.g. `topics: [a, b]`), edited as one-per-line text.
function isScalarArray(spec: RawFieldSpec): boolean {
  return Boolean(spec.name) && spec.kind === 'array' && SCALAR_TYPES.has(spec.type) && !hasOptions(spec);
}

// A nested object with its own fields (e.g. `tls`, `batching`) — rendered as a
// collapsible sub-section whose children recurse through the same renderer.
function isObjectGroup(spec: RawFieldSpec): boolean {
  return Boolean(spec.name) && spec.kind === 'scalar' && (spec.children?.length ?? 0) > 0;
}

// A field whose value is itself a nested component (a processor sub-pipeline, an
// input/output, …). These are their own nodes in the graph and are edited by
// selecting them on the canvas — never inline here. They're preserved untouched.
const COMPONENT_FIELD_TYPES = new Set([
  'input',
  'output',
  'processor',
  'cache',
  'rate_limit',
  'buffer',
  'metrics',
  'tracer',
  'scanner',
]);
function isComponentField(spec: RawFieldSpec): boolean {
  // A resource reference is a string link, not an inline nested component.
  return Boolean(spec.name) && COMPONENT_FIELD_TYPES.has(spec.type) && !isResourceRefField(spec);
}

// Fields rendered as form controls. Nested components are excluded (edited on the
// canvas); other complex fields (object arrays, maps, 2d arrays, unknown keys) fall
// back to the raw-YAML section.
function isFormField(spec: RawFieldSpec): boolean {
  return !isComponentField(spec) && (isScalarField(spec) || isScalarArray(spec) || isObjectGroup(spec));
}

// ---- plain-object path helpers (the config we mutate is plain JSON) -----------

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

// ---- value coercion -----------------------------------------------------------

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
  // Interpolations (`${ENV}`, secrets, Bloblang) are valid in any field, incl. numeric ones — keep
  // them verbatim rather than coercing to a number (NaN → '' → dropped on commit). Matches numericHint.
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

// ---- flattening the schema into addressable leaves ----------------------------

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
    } else if (isScalarArray(f)) {
      arrays.push(leaf);
    } else if (isObjectGroup(f)) {
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

// Parse the "Other settings (YAML)" text. Returns the mapping, `{}` when empty (an intentional
// clear), or `null` when the text is invalid / not a mapping — so callers preserve the existing
// keys instead of silently wiping them.
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
};

function applyScalarEdits(config: Record<string, unknown>, scalars: Leaf[], data: FormValues, dirty: DirtyState): void {
  for (const { spec, path, key } of scalars) {
    if (!dirty.fields?.[key]) {
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
}: BuildArgs): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (data.label.trim()) {
    next.label = data.label.trim();
  }

  const original = value[componentName];
  // A component whose value isn't a plain object — e.g. a `switch`/`try`/`catch`/
  // `for_each` whose value is a list of cases/processors, or a scalar-valued component.
  // The object-field form can't model these (their nested items are edited on the
  // canvas), so preserve the value verbatim and only patch the label. Rebuilding it
  // here would drop the children (it would write `{}` over the array).
  if (!(original && typeof original === 'object') || Array.isArray(original)) {
    next[componentName] = original ?? {};
    return next;
  }

  const config: Record<string, unknown> = structuredClone(inner);
  if (showRaw && dirty.raw) {
    const parsedRaw = parseRawSection(showRaw, data.raw);
    // Invalid YAML → null: keep the existing raw keys rather than wiping them (the editor shows
    // an inline error; the broken draft just isn't committed).
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

// ---- field rendering ----------------------------------------------------------

const FieldLabel = ({ spec }: { spec: RawFieldSpec }) => (
  <div className="flex items-center gap-2">
    <Label className="font-medium text-sm">{spec.name}</Label>
    {checkRequired(spec) ? (
      <span className="text-destructive text-xs" title="Required">
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

const ScalarControl = ({
  spec,
  value,
  onChange,
}: {
  spec: RawFieldSpec;
  value: string | boolean;
  onChange: (value: unknown) => void;
}) => {
  const { componentResourceKind } = useContext(ResourceFieldContext);
  if (spec.type === 'bool') {
    return <Switch checked={Boolean(value)} onCheckedChange={onChange} />;
  }
  const resourceKind = resolveResourceKind(spec, componentResourceKind);
  if (resourceKind) {
    return <ResourceReferenceSelect kind={resourceKind} onChange={onChange} value={String(value ?? '')} />;
  }
  if (hasOptions(spec)) {
    return (
      <Select onValueChange={onChange} value={String(value ?? '')}>
        <SelectTrigger>
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
  // Numeric fields use a text input with a numeric inputMode rather than
  // type="number": a number input blanks out any value the browser can't parse
  // (e.g. a config like `count: 1000$`), hiding the real value. Text always shows
  // it — including malformed values — so typos are visible and fixable.
  const numericMode = spec.type === 'int' ? 'numeric' : 'decimal';
  return (
    <Input
      inputMode={spec.type === 'int' || spec.type === 'float' ? numericMode : undefined}
      onChange={onChange}
      placeholder={spec.defaultValue || undefined}
      type="text"
      value={String(value ?? '')}
    />
  );
};

const INT_VALUE_RE = /^-?\d+$/;

// A non-blocking validity hint for numeric fields. Values containing `${…}` are
// interpolations (env vars, secrets, Bloblang) — legitimate in any field — so only
// plainly malformed literals are flagged.
function numericHint(spec: RawFieldSpec, value: string | boolean): string | null {
  const text = String(value ?? '').trim();
  if (text === '' || typeof value === 'boolean' || text.includes('${')) {
    return null;
  }
  if (spec.type === 'int' && !INT_VALUE_RE.test(text)) {
    return 'Not a valid integer';
  }
  if (spec.type === 'float' && Number.isNaN(Number(text))) {
    return 'Not a valid number';
  }
  return null;
}

const ScalarField = ({ leaf, control }: { leaf: Leaf; control: Control<FormValues> }) => (
  <Controller
    control={control}
    name={`fields.${leaf.key}` as FieldPath<FormValues>}
    render={({ field }) => {
      const hint = numericHint(leaf.spec, field.value as string | boolean);
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabel spec={leaf.spec} />
          <ScalarControl onChange={field.onChange} spec={leaf.spec} value={field.value as string | boolean} />
          {hint ? (
            <Text className="text-destructive" variant="bodySmall">
              {hint}
            </Text>
          ) : null}
          <FieldDescription spec={leaf.spec} />
        </div>
      );
    }}
  />
);

const ArrayField = ({ leaf, control }: { leaf: Leaf; control: Control<FormValues> }) => (
  <Controller
    control={control}
    name={`arrays.${leaf.key}` as FieldPath<FormValues>}
    render={({ field }) => (
      <div className="flex flex-col gap-1.5">
        <FieldLabel spec={leaf.spec} />
        <Textarea
          className="font-mono text-sm"
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
  if (isScalarArray(spec)) {
    return <ArrayField control={control} leaf={{ spec, path: here, key: here.join('/') }} />;
  }
  if (isObjectGroup(spec)) {
    return (
      <FieldGroup defaultOpen={checkRequired(spec) && !spec.advanced} label={spec.name}>
        <SchemaFields control={control} fields={spec.children ?? []} path={here} />
      </FieldGroup>
    );
  }
  return null;
};

// Render a list of fields, required ones first, then optional, then advanced.
const SchemaFields = ({
  fields,
  path,
  control,
}: {
  fields: RawFieldSpec[];
  path: string[];
  control: Control<FormValues>;
}) => {
  const formFields = fields.filter(isFormField);
  const ordered = [
    ...formFields.filter((f) => checkRequired(f) && !f.advanced),
    ...formFields.filter((f) => !(checkRequired(f) || f.advanced)),
    ...formFields.filter((f) => f.advanced),
  ];
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
  /** Rendered at the top of the scroll area (e.g. a case's routing-condition section), so it
      scrolls WITH the form rather than sticking above it. */
  headerSlot?: React.ReactNode;
  /** A control-flow component's direct children (cases / steps), shown as a clickable list so
      the user can jump from this high-level node to a child's full config. */
  childItems?: InspectorChildItem[];
  onSelectChild?: (item: InspectorChildItem) => void;
  /** Reports the assembled component config as the form changes (null when clean), so the inspector
      can auto-commit it on node-leave / pipeline-save — there is no per-node Apply button. */
  onConfigChange?: (config: Record<string, unknown> | null) => void;
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
}: NodeConfigFormProps) {
  const hasChildList = Boolean(childItems && childItems.length > 0 && onSelectChild);
  const fields = spec.config?.children ?? [];
  const componentValue = value[componentName];
  // A list-valued component (switch/try/catch/for_each): its value is an array of
  // cases/processors edited on the canvas, not a set of object fields. The schema's
  // field list actually describes a single case, so rendering it here is misleading and
  // saving it would clobber the array — show a hint instead.
  const isListValued = Array.isArray(componentValue);
  const inner =
    componentValue && typeof componentValue === 'object' && !isListValued
      ? (componentValue as Record<string, unknown>)
      : {};

  const topFields = fields.filter(isFormField);
  const required = topFields.filter((f) => checkRequired(f) && !f.advanced);
  const optional = topFields.filter((f) => !(checkRequired(f) || f.advanced));
  const advanced = topFields.filter((f) => f.advanced);
  // Nested-component fields are edited on the canvas; surface a hint, never a control.
  const componentFields = fields.filter(isComponentField);

  // Leaves drive form defaults + assembly. Complex (non-component) schema fields and
  // any unknown keys go to the raw-YAML fallback; nested-component fields are neither
  // shown nor put in raw — they're preserved untouched (the form starts from a clone).
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
          })
        : null
    );
  }, [watched, isDirty, getValues, onConfigChange]);

  const resourceCtx: ResourceFieldContextValue = {
    labels: resourceLabels ?? { cache: [], rate_limit: [] },
    onCreateResource,
    componentResourceKind:
      componentName === 'cache' ? 'cache' : componentName === 'rate_limit' ? 'rate_limit' : undefined,
  };

  return (
    <ResourceFieldContext.Provider value={resourceCtx}>
      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollShadow contentClassName="space-y-4 px-4 py-4">
          {/* Full-bleed to the scroll edges and top, then the normal padded fields follow. */}
          {headerSlot ? <div className="-mx-4 -mt-4">{headerSlot}</div> : null}
          <div className="flex flex-col gap-1.5">
            <Label className="font-medium text-sm">label</Label>
            <Controller
              control={control}
              name="label"
              render={({ field }) => (
                <Input
                  onChange={field.onChange}
                  placeholder="Optional identifier for this component"
                  value={field.value}
                />
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
          {!isListValued && componentFields.length > 0 && !hasChildList ? (
            <div className="rounded-md border border-border/60 border-dashed px-3 py-2">
              <Text className="text-muted-foreground" variant="bodySmall">
                {componentFields.map((f) => f.name).join(', ')}{' '}
                {componentFields.length === 1 ? 'is a nested component' : 'are nested components'} — select{' '}
                {componentFields.length === 1 ? 'it' : 'them'} on the canvas to edit.
              </Text>
            </div>
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
                      <div className="h-[200px] overflow-hidden rounded-md border border-border">
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
