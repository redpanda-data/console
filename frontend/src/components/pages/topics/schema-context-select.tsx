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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';

import { useSchemaRegistryContextsQuery } from '../../../react-query/api/schema-registry';
import { useSupportedFeaturesStore } from '../../../state/supported-features';

/** Resolve the context from the topic's redpanda.schema.registry.context config. */
export const AUTO_SCHEMA_CONTEXT = '';
/** Force the default context, even when the topic is bound to another one. */
export const DEFAULT_SCHEMA_CONTEXT = '.';

// Select items need a non-empty value.
const AUTO_OPTION = '__auto__';

export type SchemaContextSelectProps = {
  id: string;
  value: string;
  onChange: (schemaContext: string) => void;
  /** Context names as returned by the registry, e.g. [".", ".staging"]. */
  contexts: string[];
  disabled?: boolean;
  title?: string;
};

export const schemaContextOptions = (contexts: string[], value: string) => {
  const options = [
    { value: AUTO_OPTION, label: 'Automatic (topic config)' },
    { value: DEFAULT_SCHEMA_CONTEXT, label: 'Default' },
    ...contexts
      .filter((c) => c !== DEFAULT_SCHEMA_CONTEXT)
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ value: c, label: c })),
  ];
  // Keep a value that is not in the list (e.g. from a shared URL) selectable.
  if (value !== AUTO_SCHEMA_CONTEXT && !options.some((o) => o.value === value)) {
    options.push({ value, label: value });
  }
  return options;
};

export const SchemaContextSelect = ({ id, value, onChange, contexts, disabled, title }: SchemaContextSelectProps) => {
  const options = schemaContextOptions(contexts, value);
  return (
    <Select
      disabled={disabled}
      onValueChange={(v) => onChange(v === AUTO_OPTION ? AUTO_SCHEMA_CONTEXT : v)}
      value={value === AUTO_SCHEMA_CONTEXT ? AUTO_OPTION : value}
    >
      <SelectTrigger className="w-full" testId={id} title={title}>
        <SelectValue>{(v: unknown) => options.find((o) => o.value === v)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/** True when the connected Schema Registry has contexts enabled. */
export const useSchemaContextsSupported = () => useSupportedFeaturesStore((s) => s.schemaRegistryContexts);

/** SchemaContextSelect fed with the registry's contexts. Render only when useSchemaContextsSupported(). */
export const TopicSchemaContextSelect = (props: Omit<SchemaContextSelectProps, 'contexts'>) => {
  const { data } = useSchemaRegistryContextsQuery();
  return <SchemaContextSelect {...props} contexts={(data ?? []).map((c) => c.name)} />;
};
