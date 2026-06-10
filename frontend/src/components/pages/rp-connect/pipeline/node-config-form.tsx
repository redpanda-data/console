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

import { Button } from 'components/redpanda-ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { DialogBody, DialogFooter } from 'components/redpanda-ui/components/dialog';
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
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { ChevronDown } from 'lucide-react';
import { type Control, Controller, type FieldPath, useForm } from 'react-hook-form';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';

import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';

const SCALAR_TYPES = new Set(['string', 'int', 'float', 'bool']);

function hasOptions(spec: RawFieldSpec): boolean {
  return (spec.annotatedOptions?.length ?? 0) > 0;
}

/** Fields we render as form controls; everything else goes to the raw fallback. */
function isScalarField(spec: RawFieldSpec): boolean {
  return Boolean(spec.name) && spec.kind === 'scalar' && (SCALAR_TYPES.has(spec.type) || hasOptions(spec));
}

function initialFieldValue(spec: RawFieldSpec, current: unknown): string | boolean {
  const isMissing = current === undefined || current === null;
  if (spec.type === 'bool') {
    return isMissing ? spec.defaultValue === 'true' : Boolean(current);
  }
  if (isMissing) {
    return spec.defaultValue ?? '';
  }
  return String(current);
}

function coerceFieldValue(spec: RawFieldSpec, raw: string | boolean): string | number | boolean {
  if (spec.type === 'bool') {
    return Boolean(raw);
  }
  if (spec.type === 'int') {
    const n = Number.parseInt(String(raw), 10);
    return Number.isNaN(n) ? '' : n;
  }
  if (spec.type === 'float') {
    const n = Number(raw);
    return raw === '' || Number.isNaN(n) ? '' : n;
  }
  return String(raw);
}

type FormValues = { label: string; raw: string; fields: Record<string, string | boolean> };

// Seed the raw-fallback section's nested settings, ignoring invalid YAML.
function parseRawSection(showRaw: boolean, raw: string): Record<string, unknown> {
  if (!(showRaw && raw.trim())) {
    return {};
  }
  try {
    const parsed = parseYaml(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Assemble the component entry (`{ [label], [name]: config }`) from form values.
function buildComponentEntry(
  componentName: string,
  scalarFields: RawFieldSpec[],
  showRaw: boolean,
  data: FormValues
): Record<string, unknown> {
  const innerConfig: Record<string, unknown> = parseRawSection(showRaw, data.raw);
  for (const f of scalarFields) {
    const coerced = coerceFieldValue(f, data.fields[f.name]);
    if (f.type === 'bool') {
      innerConfig[f.name] = coerced;
    } else if (coerced !== '') {
      innerConfig[f.name] = coerced;
    }
  }
  const next: Record<string, unknown> = {};
  if (data.label.trim()) {
    next.label = data.label.trim();
  }
  next[componentName] = innerConfig;
  return next;
}

type NodeConfigFormProps = {
  spec: ConnectComponentSpec;
  componentName: string;
  /** The full component entry, e.g. `{ label, kafka: {...} }`. */
  value: Record<string, unknown>;
  onSubmit: (next: Record<string, unknown>) => void;
  onCancel: () => void;
};

const FieldRow = ({ spec, children }: { spec: RawFieldSpec; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-2">
      <Label className="font-medium text-sm">{spec.name}</Label>
      {spec.optional ? null : (
        <span className="text-destructive text-xs" title="Required">
          *
        </span>
      )}
      {spec.type && spec.type !== 'string' ? <span className="text-muted-foreground text-xs">{spec.type}</span> : null}
    </div>
    {children}
    {spec.description ? (
      <Text className="text-muted-foreground" variant="bodySmall">
        {spec.description}
      </Text>
    ) : null}
  </div>
);

const ScalarControl = ({
  spec,
  value,
  onChange,
}: {
  spec: RawFieldSpec;
  value: string | boolean;
  // RHF's field.onChange accepts an event or a raw value.
  onChange: (value: unknown) => void;
}) => {
  if (spec.type === 'bool') {
    return <Switch checked={Boolean(value)} onCheckedChange={onChange} />;
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
  return (
    <Input
      onChange={onChange}
      placeholder={spec.defaultValue || undefined}
      type={spec.type === 'int' || spec.type === 'float' ? 'number' : 'text'}
      value={String(value ?? '')}
    />
  );
};

const ScalarField = ({ spec, control }: { spec: RawFieldSpec; control: Control<FormValues> }) => {
  const name = `fields.${spec.name}` as FieldPath<FormValues>;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FieldRow spec={spec}>
          <ScalarControl onChange={field.onChange} spec={spec} value={field.value as string | boolean} />
        </FieldRow>
      )}
    />
  );
};

export function NodeConfigForm({ spec, componentName, value, onSubmit, onCancel }: NodeConfigFormProps) {
  const fields = spec.config?.children ?? [];
  const inner =
    value[componentName] && typeof value[componentName] === 'object' && !Array.isArray(value[componentName])
      ? (value[componentName] as Record<string, unknown>)
      : {};

  const scalarFields = fields.filter(isScalarField);
  const scalarNames = new Set(scalarFields.map((f) => f.name));
  const required = scalarFields.filter((f) => !(f.optional || f.advanced));
  const optional = scalarFields.filter((f) => f.optional && !f.advanced);
  const advanced = scalarFields.filter((f) => f.advanced);

  // Anything the form doesn't render (nested objects/arrays/maps, unknown keys)
  // is preserved and editable through a raw YAML fallback section.
  const rawObject = Object.fromEntries(Object.entries(inner).filter(([key]) => !scalarNames.has(key)));
  const complexFieldCount = fields.length - scalarFields.length;
  const showRaw = Object.keys(rawObject).length > 0 || complexFieldCount > 0;

  const { control, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      label: typeof value.label === 'string' ? value.label : '',
      raw: Object.keys(rawObject).length > 0 ? yamlStringify(rawObject) : '',
      fields: Object.fromEntries(scalarFields.map((f) => [f.name, initialFieldValue(f, inner[f.name])])),
    },
  });

  const submit = handleSubmit((data) => onSubmit(buildComponentEntry(componentName, scalarFields, showRaw, data)));

  return (
    <>
      <DialogBody className="space-y-4">
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

        {required.map((f) => (
          <ScalarField control={control} key={f.name} spec={f} />
        ))}

        {optional.length > 0 ? (
          <FieldGroup label="Optional">
            {optional.map((f) => (
              <ScalarField control={control} key={f.name} spec={f} />
            ))}
          </FieldGroup>
        ) : null}

        {advanced.length > 0 ? (
          <FieldGroup defaultOpen={false} label="Advanced">
            {advanced.map((f) => (
              <ScalarField control={control} key={f.name} spec={f} />
            ))}
          </FieldGroup>
        ) : null}

        {showRaw ? (
          <FieldGroup defaultOpen={Object.keys(rawObject).length > 0} label="Other settings (YAML)">
            <Controller
              control={control}
              name="raw"
              render={({ field }) => (
                <div className="h-[200px] overflow-hidden rounded-md border border-border">
                  <YamlEditor
                    onChange={(v) => field.onChange(v || '')}
                    options={{ minimap: { enabled: false } }}
                    transparentBackground
                    value={field.value}
                  />
                </div>
              )}
            />
          </FieldGroup>
        ) : null}
      </DialogBody>

      <DialogFooter>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button onClick={submit} type="button">
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

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
    {/* No height animation: the Dialog animates its own height, so animating the
        panel too makes the two stagger. Open/close instantly here. */}
    <CollapsibleContent className="flex flex-col gap-4 px-3 pt-1 pb-3" transition={{ duration: 0 }}>
      {children}
    </CollapsibleContent>
  </Collapsible>
);
