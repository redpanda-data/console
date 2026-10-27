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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Combobox } from 'components/redpanda-ui/components/combobox';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Field, useFieldContext } from 'components/redpanda-ui/components/field';
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
import { cn } from 'components/redpanda-ui/lib/utils';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { AlertCircle, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { type Control, Controller, type FieldPath, useForm, useWatch } from 'react-hook-form';
import { useListTopicsQuery } from 'react-query/api/topic';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';

import { FieldDescription } from './field-description';
import type { FieldLintErrors } from './lint-field-mapping';
import { ScrollShadow } from './scroll-shadow';
import { getSecretSyntax, REDPANDA_TOPIC_AND_USER_COMPONENTS } from '../types/constants';
import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';
import { getFieldDocsUrl } from '../utils/connector-docs';
import {
  checkRequired,
  fieldHasOptions,
  isComponentField,
  isFormField,
  isObjectGroupField,
  isScalarArrayField,
  isScalarField,
} from '../utils/schema';
import { isTopicField } from '../utils/wizard';
import type { EditTarget, ResourceKind } from '../utils/yaml';
import { resourceKindForComponentName } from '../utils/yaml';

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
  if (item.condition) {
    return `if ${item.condition}`;
  }
  if (item.isDefault) {
    return 'default';
  }
  if (item.isErrorPath) {
    return 'on error';
  }
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
      className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-left transition-colors outline-none hover:border-primary/50 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      onClick={() => onSelect(item)}
      type="button"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {condText ? (
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
      {item.lintCount ? <CountDot count={item.lintCount} size="sm" variant="destructive" /> : null}
      <TonedIcon className="size-4 shrink-0" icon={ChevronRight} tone="muted" />
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

// Cluster-linking context (resource labels, create-resource, create-topic), provided by the
// inspector so the form stays a pure config editor. Context rather than props because the
// consumers are leaf controls several generic layers down (SchemaFields → SchemaField →
// Scalar/ArrayField → controls) — drilling would thread cluster concerns through every layer.
type ResourceFieldContextValue = {
  labels: Record<ResourceKind, string[]>;
  onCreateResource?: (kind: ResourceKind) => void;
  // Kind of the edited component, so a plainly-typed `resource:` string field still reads as a link.
  componentResourceKind?: ResourceKind;
  // True when the component's topic/topics fields name topics on THIS cluster (kafka/redpanda
  // family) — gates the pickers, so an mqtt/pulsar topic field stays a plain input.
  clusterTopicFields?: boolean;
  /** Opens the Add-topic dialog; the created topic is written into the component's topic field. */
  onCreateTopic?: () => void;
  /** Docs URL for one field of the edited component, by its path. */
  fieldDocsUrl?: (path: string[]) => string | undefined;
};
const ResourceFieldContext = createContext<ResourceFieldContextValue>({ labels: { cache: [], rate_limit: [] } });

const CREATE_RESOURCE_VALUE = '__create_resource__';

// Resource kind a field links to: by field type, or by the enclosing cache/rate_limit component for
// a field named `resource` (some schemas type it as a plain string).
function resolveResourceKind(spec: RawFieldSpec, componentResourceKind?: ResourceKind): ResourceKind | undefined {
  if (spec.type === 'cache' || spec.type === 'rate_limit') {
    return spec.type;
  }
  if (spec.name === 'resource' && spec.kind === 'scalar' && componentResourceKind) {
    return componentResourceKind;
  }
}

// Dropdown for a `resource:` link — never free text, so the reference can't be mistyped; a stale
// value is still shown, flagged missing.
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

const arrayFieldLines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

function coerceArrayItems(spec: RawFieldSpec, text: string): unknown[] {
  const lines = arrayFieldLines(text);
  if (spec.type === 'int' || spec.type === 'float') {
    return lines.map(Number).filter((n) => !Number.isNaN(n));
  }
  return lines;
}

type Leaf = { spec: RawFieldSpec; path: string[]; key: string };
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

// Lint messages anchored to field keys, provided by the inspector; read by the recursive field
// renderers (a prop would have to thread through every SchemaField level).
const FieldLintErrorsContext = createContext<FieldLintErrors>(new Map());

// Lint errors anchored under this field. Hidden while the field is dirty — the user is addressing
// it, and the message describes the SAVED value, not what they're typing.
const FieldLintErrorList = ({ fieldKey, dirty }: { fieldKey: string; dirty: boolean }) => {
  const errors = useContext(FieldLintErrorsContext).get(fieldKey);
  // Inside an invalid registry Field, this list is what the control's aria-describedby points at.
  const { errorId } = useFieldContext();
  if (!errors || errors.length === 0 || dirty) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1" id={errorId}>
      {errors.map((message, i) => (
        // Indexed key: identical messages can anchor to one field, and the list is rebuilt per render.
        <div className="flex items-start gap-1 text-body-sm text-destructive" key={`${i}-${message}`}>
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {message}
        </div>
      ))}
    </div>
  );
};

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

function applyRawEdits(config: Record<string, unknown>, { rawKeys, showRaw, data, dirty }: BuildArgs): void {
  if (!(showRaw && dirty.raw)) {
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
  if (requireLabel && typeof value.label === 'string' && value.label) {
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
  if (!(original && typeof original === 'object') || Array.isArray(original)) {
    next[componentName] = original ?? {};
    return next;
  }
  next[componentName] = editedConfig(args);
  return next;
}

const FieldLabel = ({ spec, htmlFor }: { spec: RawFieldSpec; htmlFor?: string }) => (
  <div className="flex items-center gap-2">
    <Label className="shrink-0" htmlFor={htmlFor}>
      {spec.name}
    </Label>
    {checkRequired(spec) ? (
      <ElementTooltip content="Required">
        <span aria-hidden className="shrink-0 text-body-sm text-destructive">
          *
        </span>
      </ElementTooltip>
    ) : null}
    {spec.type && spec.type !== 'string' ? (
      <span className="shrink-0 text-body-sm text-muted-foreground">{spec.type}</span>
    ) : null}
    {spec.defaultValue ? (
      // Defaults can be long templates — keep the label on one line and ellipsize, full value on hover.
      <ElementTooltip content={`default: ${spec.defaultValue}`}>
        <span className="min-w-0 truncate text-body-sm text-muted-foreground">
          default: <span className="font-mono">{spec.defaultValue}</span>
        </span>
      </ElementTooltip>
    ) : null}
  </div>
);

// Mask fields the schema flags as secret (stamped from the raw config schema; the proto has no
// secret field), plus a name heuristic as the union — the flag misses plausibly-sensitive fields
// like AWS session tokens and SAS tokens, and the heuristic is all we have on older dataplanes.
const SECRET_NAME_RE = /(password|secret|token|private_key|api_key|passphrase)$/i;

const isSecretField = (spec: RawFieldSpec): boolean =>
  spec.secret === true || (spec.type === 'string' && !fieldHasOptions(spec) && SECRET_NAME_RE.test(spec.name ?? ''));

// Masked credential input. `type="password"` gives the registry Input's reveal toggle; a `${…}`
// interpolation isn't a literal credential, so it's shown in the clear.
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

// Cluster topics offered by topic-field pickers (internal topics hidden, like the template flow).
function useTopicOptions() {
  const { data, isLoading } = useListTopicsQuery(undefined, undefined, { hideInternalTopics: true });
  const options = (data.topics ?? []).map((t) => ({ value: t.name, label: t.name }));
  return { options, isLoading };
}

// The "Create new topic" affordance next to topic pickers; opens the Add-topic dialog. The created
// topic is written into the YAML, which re-syncs into the (clean) form.
const CreateTopicButton = () => {
  const { onCreateTopic } = useContext(ResourceFieldContext);
  if (!onCreateTopic) {
    return null;
  }
  return (
    <Button className="self-start" onClick={onCreateTopic} size="sm" type="button" variant="outline">
      <Plus className="size-3.5" /> Create new topic
    </Button>
  );
};

// A topic-named scalar: pick an existing cluster topic (like the template flow's selector), type a
// custom value (interpolations, `topic:partition`), or create a new topic. Typed text propagates
// per keystroke (onInputValueChange): the combobox itself only fires onChange on Enter/selection,
// which would let a blur-commit save stale YAML while the field still displays the typed text.
// The combobox forwards no aria props, so a registry Field marks its input invalid and describes it
// by the lint messages rendered inside; `invalid` must be set exactly when those messages render.
const TopicScalarControl = ({
  id,
  value,
  onChange,
  invalid,
  fieldKey,
  dirty,
}: {
  id?: string;
  value: string;
  onChange: (value: unknown) => void;
  invalid: boolean;
  fieldKey: string;
  dirty: boolean;
}) => {
  const { options, isLoading } = useTopicOptions();
  return (
    <Field data-invalid={invalid}>
      <div className="flex flex-col gap-2">
        <Combobox
          creatable
          createLabel="value"
          id={id}
          isLoading={isLoading}
          onChange={onChange}
          onInputValueChange={onChange}
          options={options}
          placeholder="Select or enter a topic…"
          value={value}
        />
        <CreateTopicButton />
      </div>
      <FieldLintErrorList dirty={dirty} fieldKey={fieldKey} />
    </Field>
  );
};

// Appends cluster topics to a topics-list field without giving up the free-text lines (regex
// patterns, explicit partitions) the textarea supports.
const TopicArrayPicker = ({ lines, onAppend }: { lines: string[]; onAppend: (topic: string) => void }) => {
  const { options, isLoading } = useTopicOptions();
  // Remounted per pick: the combobox pins value='' but keeps displaying the picked label as if
  // it were still a pending selection.
  const [pickCount, setPickCount] = useState(0);
  const remaining = options.filter((o) => !lines.includes(o.value));
  return (
    <div className="flex flex-col gap-2">
      <Combobox
        clearable={false}
        isLoading={isLoading}
        key={pickCount}
        onChange={(topic) => {
          if (topic) {
            onAppend(topic);
            setPickCount((n) => n + 1);
          }
        }}
        options={remaining}
        placeholder="Add existing topic…"
        value=""
      />
      <CreateTopicButton />
    </div>
  );
};

// Sentinel item value — '' can't be one.
const UNSET_OPTION = '__unset__';

/**
 * Enum (annotated-options) field. A select can't be cleared by deleting text the way inputs can,
 * so optional fields get an explicit unset item ("Default (x)" / "Not set") — without it a value
 * seeded by the insert template is stuck in the YAML forever. Unset maps to '', which the save
 * path treats as "remove the key".
 */
const OptionsSelect = ({
  spec,
  value,
  onChange,
  id,
  required,
}: {
  spec: RawFieldSpec;
  value: string | boolean;
  onChange: (value: unknown) => void;
  id?: string;
  required?: boolean;
}) => (
  <Select onValueChange={(next) => onChange(next === UNSET_OPTION ? '' : next)} value={String(value ?? '')}>
    <SelectTrigger aria-label={spec.name} aria-required={required || undefined} id={id}>
      <SelectValue placeholder={spec.defaultValue || 'Select…'} />
    </SelectTrigger>
    <SelectContent>
      {required ? null : (
        <SelectItem key={UNSET_OPTION} value={UNSET_OPTION}>
          <span className="text-muted-foreground">
            {spec.defaultValue ? `Default (${spec.defaultValue})` : 'Not set'}
          </span>
        </SelectItem>
      )}
      {spec.annotatedOptions?.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.value}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

type ScalarControlProps = {
  spec: RawFieldSpec;
  value: string | boolean;
  onChange: (value: unknown) => void;
  id?: string;
  invalid?: boolean;
};

// Whether a scalar gets the cluster topic picker: a topic-named field on a Redpanda connector that
// ScalarControl would otherwise free-type (not a switch, resource reference, or enum select).
function usesTopicPicker(spec: RawFieldSpec, { clusterTopicFields, componentResourceKind }: ResourceFieldContextValue) {
  return (
    Boolean(clusterTopicFields) &&
    isTopicField(spec.name ?? '') &&
    spec.type !== 'bool' &&
    !resolveResourceKind(spec, componentResourceKind) &&
    !fieldHasOptions(spec)
  );
}

const ScalarControl = ({ spec, value, onChange, id, invalid }: ScalarControlProps) => {
  const { componentResourceKind } = useContext(ResourceFieldContext);
  if (spec.type === 'bool') {
    return <Switch aria-label={spec.name} checked={Boolean(value)} id={id} onCheckedChange={onChange} />;
  }
  const resourceKind = resolveResourceKind(spec, componentResourceKind);
  if (resourceKind) {
    return <ResourceReferenceSelect id={id} kind={resourceKind} onChange={onChange} value={String(value ?? '')} />;
  }
  if (fieldHasOptions(spec)) {
    return <OptionsSelect id={id} onChange={onChange} required={checkRequired(spec)} spec={spec} value={value} />;
  }
  return <TypedScalarControl id={id} invalid={invalid} onChange={onChange} spec={spec} value={value} />;
};

// A free-typed scalar other than a cluster topic: a masked credential, or plain text.
const TypedScalarControl = ({ spec, value, onChange, id, invalid }: ScalarControlProps) => {
  const required = checkRequired(spec);
  if (isSecretField(spec)) {
    return <SecretInput id={id} onChange={onChange} required={required} value={String(value ?? '')} />;
  }
  return (
    <ScalarTextInput id={id} invalid={invalid} onChange={onChange} required={required} spec={spec} value={value} />
  );
};

// Text input (numeric inputMode), not type="number": a number input blanks values the browser
// can't parse (e.g. `1000$`); text keeps them visible and fixable.
const ScalarTextInput = ({
  spec,
  value,
  onChange,
  id,
  invalid,
  required,
}: {
  spec: RawFieldSpec;
  value: string | boolean;
  onChange: (value: unknown) => void;
  id?: string;
  invalid?: boolean;
  required?: boolean;
}) => {
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
  const lintErrors = useContext(FieldLintErrorsContext);
  const resourceFields = useContext(ResourceFieldContext);
  const docsUrl = resourceFields.fieldDocsUrl?.(leaf.path);
  const topicPicker = usesTopicPicker(leaf.spec, resourceFields);
  return (
    <Controller
      control={control}
      name={`fields.${leaf.key}` as FieldPath<FormValues>}
      render={({ field, fieldState }) => {
        const hint = numericHint(leaf.spec, field.value as string | boolean);
        const showSecretTip = isSecretField(leaf.spec) && !String(field.value ?? '').includes('${');
        const hasLintError = (lintErrors.get(leaf.key)?.length ?? 0) > 0 && !fieldState.isDirty;
        return (
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={inputId} spec={leaf.spec} />
            {topicPicker ? (
              <TopicScalarControl
                dirty={fieldState.isDirty}
                fieldKey={leaf.key}
                id={inputId}
                invalid={hasLintError}
                onChange={field.onChange}
                value={String(field.value ?? '')}
              />
            ) : (
              <>
                <ScalarControl
                  id={inputId}
                  invalid={Boolean(hint) || hasLintError}
                  onChange={field.onChange}
                  spec={leaf.spec}
                  value={field.value as string | boolean}
                />
                {hint ? <div className="text-body-sm text-destructive">{hint}</div> : null}
                <FieldLintErrorList dirty={fieldState.isDirty} fieldKey={leaf.key} />
              </>
            )}
            {showSecretTip ? (
              <div className="text-body-sm text-muted-foreground">
                Tip: reference a secret (<span className="font-mono">{SECRET_REF_EXAMPLE}</span>) instead of a literal
                value.
              </div>
            ) : null}
            <FieldDescription docsUrl={docsUrl} spec={leaf.spec} />
          </div>
        );
      }}
    />
  );
};

const ArrayField = ({ leaf, control }: { leaf: Leaf; control: Control<FormValues> }) => {
  const inputId = useId();
  const lintErrors = useContext(FieldLintErrorsContext);
  const { clusterTopicFields, fieldDocsUrl } = useContext(ResourceFieldContext);
  const docsUrl = fieldDocsUrl?.(leaf.path);
  const isTopics = Boolean(clusterTopicFields) && isTopicField(leaf.spec.name ?? '');
  return (
    <Controller
      control={control}
      name={`arrays.${leaf.key}` as FieldPath<FormValues>}
      render={({ field, fieldState }) => {
        const lines = arrayFieldLines(String(field.value ?? ''));
        return (
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={inputId} spec={leaf.spec} />
            <Textarea
              aria-invalid={((lintErrors.get(leaf.key)?.length ?? 0) > 0 && !fieldState.isDirty) || undefined}
              aria-required={checkRequired(leaf.spec) || undefined}
              id={inputId}
              onChange={field.onChange}
              placeholder="One value per line"
              rows={3}
              value={String(field.value ?? '')}
            />
            {isTopics ? (
              <TopicArrayPicker lines={lines} onAppend={(t) => field.onChange([...lines, t].join('\n'))} />
            ) : null}
            <FieldLintErrorList dirty={fieldState.isDirty} fieldKey={leaf.key} />
            <FieldDescription docsUrl={docsUrl} spec={leaf.spec} />
          </div>
        );
      }}
    />
  );
};

const FieldGroup = ({
  label,
  defaultOpen = true,
  forceOpenSignal = '',
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  /** Reopens the group whenever this changes to non-empty (lint anchored new errors inside it). */
  forceOpenSignal?: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen || forceOpenSignal !== '');
  useEffect(() => {
    if (forceOpenSignal) {
      setOpen(true);
    }
  }, [forceOpenSignal]);
  // The registry Collapsible is unstyled: the frame, header padding, and body layout are this group's own boxes.
  return (
    <div className="rounded-md border border-border/60">
      <Collapsible onOpenChange={setOpen} open={open}>
        <CollapsibleTrigger className="group flex w-full text-left">
          <span className="flex flex-1 items-center justify-between px-3 py-2">
            <span className="text-body font-medium">{label}</span>
            <span className="inline-flex transition-transform group-data-[panel-open]:rotate-180">
              <TonedIcon className="size-4" icon={ChevronDown} tone="muted" />
            </span>
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-4 px-3 pt-1 pb-3">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

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
  const schemaKeys = new Set(fields.map((f) => f.name).filter(Boolean));
  const complexSchemaKeys = fields
    .filter((f) => f.name && (f.deprecated || !(isFormField(f) || isComponentField(f))))
    .map((f) => f.name);
  const unknownKeys = Object.keys(inner).filter((k) => !schemaKeys.has(k));
  return [...new Set([...complexSchemaKeys, ...unknownKeys])].filter((k) => inner[k] !== undefined);
}

// Leaves drive form defaults + assembly; everything else round-trips through the raw section.
function deriveFormModel(fields: RawFieldSpec[], componentValue: unknown): FormModel {
  const isListValued = Array.isArray(componentValue);
  const inner =
    componentValue && typeof componentValue === 'object' && !isListValued
      ? (componentValue as Record<string, unknown>)
      : {};
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
    if (numericHint(leaf.spec, current.fields[leaf.key])) {
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
    .map((f) => lintErrorSignatureUnder(errors, f.name))
    .filter(Boolean)
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
                onChange={(v) => field.onChange(v || '')}
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
const PendingEditsBar = ({ onApply }: { onApply: () => void }) => (
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

const isCommitShortcut = (e: React.KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.key === 'Enter';

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
            {headerSlot ? <div className="-mx-4 -mt-4">{headerSlot}</div> : null}
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
