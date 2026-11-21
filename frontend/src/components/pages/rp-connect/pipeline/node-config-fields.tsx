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
import { AlertCircle, ChevronDown, Plus } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useState } from 'react';
import { type Control, Controller } from 'react-hook-form';
import { useListTopicsQuery } from 'react-query/api/topic';

import { FieldDescription } from './field-description';
import type { FieldLintErrors } from './lint-field-mapping';
import { getSecretSyntax } from '../types/constants';
import type { RawFieldSpec } from '../types/schema';
import { checkRequired, fieldHasOptions } from '../utils/schema';
import { isTopicField } from '../utils/wizard';
import type { ResourceKind } from '../utils/yaml-resources';

// Cluster-linking context (resource labels, create-resource, create-topic), provided by the
// inspector so the form stays a pure config editor. Context rather than props because the
// consumers are leaf controls several generic layers down (SchemaFields → SchemaField →
// Scalar/ArrayField → controls) — drilling would thread cluster concerns through every layer.
export type ResourceFieldContextValue = {
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

export const ResourceFieldContext = createContext<ResourceFieldContextValue>({ labels: { cache: [], rate_limit: [] } });

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

export const arrayFieldLines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

export type Leaf = { spec: RawFieldSpec; path: string[]; key: string };

// Lint messages anchored to field keys, provided by the inspector; read by the recursive field
// renderers (a prop would have to thread through every SchemaField level).
export const FieldLintErrorsContext = createContext<FieldLintErrors>(new Map());

// Lint errors anchored under this field. Hidden while the field is dirty — the user is addressing
// it, and the message describes the SAVED value, not what they're typing.
export const FieldLintErrorList = ({ fieldKey, dirty }: { fieldKey: string; dirty: boolean }) => {
  const errors = useContext(FieldLintErrorsContext).get(fieldKey);
  // Inside an invalid registry Field, this list is what the control's aria-describedby points at.
  const { errorId } = useFieldContext();
  if (!errors || errors.length === 0 || dirty) {
    return null;
  }
  const occurrences = new Map<string, number>();
  return (
    <div className="flex flex-col gap-1" id={errorId}>
      {errors.map((message) => {
        const occurrence = occurrences.get(message) ?? 0;
        occurrences.set(message, occurrence + 1);
        return (
          <div className="flex items-start gap-1 text-body-sm text-destructive" key={`${message}-${occurrence}`}>
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            {message}
          </div>
        );
      })}
    </div>
  );
};

export type FormValues = {
  label: string;
  raw: string;
  fields: Record<string, string | boolean>;
  arrays: Record<string, string>;
};

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
    aria-required={(props.required ?? false) || undefined}
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
    <SelectTrigger aria-label={spec.name} aria-required={(required ?? false) || undefined} id={id}>
      <SelectValue placeholder={spec.defaultValue || 'Select…'} />
    </SelectTrigger>
    <SelectContent>
      {required === true ? null : (
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
      aria-invalid={(invalid ?? false) || undefined}
      aria-required={(required ?? false) || undefined}
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
export function numericHint(spec: RawFieldSpec, value: string | boolean): string | null {
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

export const ScalarField = ({ leaf, control }: { leaf: Leaf; control: Control<FormValues> }) => {
  const inputId = useId();
  const lintErrors = useContext(FieldLintErrorsContext);
  const resourceFields = useContext(ResourceFieldContext);
  const docsUrl = resourceFields.fieldDocsUrl?.(leaf.path);
  const topicPicker = usesTopicPicker(leaf.spec, resourceFields);
  return (
    <Controller
      control={control}
      name={`fields.${leaf.key}`}
      render={({ field, fieldState }) => {
        const hint = numericHint(leaf.spec, field.value);
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
                  value={field.value}
                />
                {hint !== null && hint !== undefined && hint !== '' ? (
                  <div className="text-body-sm text-destructive">{hint}</div>
                ) : null}
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

export const ArrayField = ({ leaf, control }: { leaf: Leaf; control: Control<FormValues> }) => {
  const inputId = useId();
  const lintErrors = useContext(FieldLintErrorsContext);
  const { clusterTopicFields, fieldDocsUrl } = useContext(ResourceFieldContext);
  const docsUrl = fieldDocsUrl?.(leaf.path);
  const isTopics = Boolean(clusterTopicFields) && isTopicField(leaf.spec.name ?? '');
  return (
    <Controller
      control={control}
      name={`arrays.${leaf.key}`}
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

export const FieldGroup = ({
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
