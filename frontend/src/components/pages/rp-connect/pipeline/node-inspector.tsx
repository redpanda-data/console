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

import type { ComponentName } from 'assets/connectors/component-logo-map';
import { Button } from 'components/redpanda-ui/components/button';
import { Text } from 'components/redpanda-ui/components/typography';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { BookOpenIcon, Box, MousePointerSquareDashed, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';

import { NodeConfigForm } from './node-config-form';
import { getConnectorDocsUrl } from './pipeline-flow-nodes';
import { ConnectorLogo } from '../onboarding/connector-logo';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { type EditTarget, firstKey, getComponentAt, setComponentAt } from '../utils/yaml';

const COMPONENT_TYPE_LABEL: Partial<Record<ConnectComponentType, string>> = {
  input: 'Input',
  output: 'Output',
  processor: 'Processor',
  cache: 'Cache',
  rate_limit: 'Rate limit',
};

function targetComponentType(target: EditTarget): ConnectComponentType {
  switch (target.kind) {
    case 'input':
      return 'input';
    case 'output':
      return 'output';
    case 'processor':
      return 'processor';
    case 'path':
      return target.componentType;
    default:
      return target.resourceKey === 'cache_resources' ? 'cache' : 'rate_limit';
  }
}

type NodeInspectorProps = {
  /** The selected component, or null when nothing is selected. */
  target: EditTarget | null;
  /** Canonical pipeline YAML; the component is read from / written back to it. */
  yaml: string;
  /** Component specs, used to drive the schema form. */
  components: ConnectComponentSpec[];
  onApply: (yaml: string) => void;
  onDelete?: (target: EditTarget) => void;
  /** Read-only inspection (view lane): show config without editing. */
  readOnly?: boolean;
};

/**
 * The always-present right rail. Shows the selected node's identity and either a
 * schema-driven form (editable components) or scoped YAML (read-only / unknown
 * schema). Edits are written back into the canonical pipeline YAML at `target`.
 */
export function NodeInspector({ target, yaml, components, onApply, onDelete, readOnly }: NodeInspectorProps) {
  const component = useMemo(() => (target ? getComponentAt(yaml, target) : undefined), [yaml, target]);
  const componentName = component ? firstKey(component) : undefined;

  const spec = useMemo(() => {
    if (!(target && componentName)) {
      return;
    }
    const type = targetComponentType(target);
    return components.find((c) => c.type === type && c.name === componentName);
  }, [components, target, componentName]);

  if (!(target && component && componentName)) {
    return <InspectorEmptyState />;
  }

  const kind = targetComponentType(target);
  const kindLabel = COMPONENT_TYPE_LABEL[kind] ?? 'Component';
  const docsUrl = getConnectorDocsUrl(kind, componentName);
  const useForm = (spec?.config?.children?.length ?? 0) > 0;

  const handleApply = (next: Record<string, unknown>) => {
    const updated = setComponentAt(yaml, target, next);
    if (updated !== null) {
      onApply(updated);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InspectorHeader
        componentName={componentName}
        docsUrl={docsUrl}
        kindLabel={kindLabel}
        onDelete={readOnly || !onDelete ? undefined : () => onDelete(target)}
      />
      {(() => {
        if (readOnly) {
          return <ReadOnlyComponent component={component} />;
        }
        if (useForm && spec) {
          return (
            <NodeConfigForm
              componentName={componentName}
              key={target.kind === 'path' ? target.path.join('/') : JSON.stringify(target)}
              onApply={handleApply}
              spec={spec}
              value={component}
            />
          );
        }
        return <RawComponentEditor component={component} onApply={handleApply} />;
      })()}
    </div>
  );
}

const InspectorEmptyState = () => (
  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
    <MousePointerSquareDashed className="size-8 text-muted-foreground/60" />
    <Text className="text-muted-foreground" variant="bodySmall">
      Select a node on the canvas to view and edit its configuration.
    </Text>
  </div>
);

const InspectorHeader = ({
  kindLabel,
  componentName,
  docsUrl,
  onDelete,
}: {
  kindLabel: string;
  componentName: string;
  docsUrl?: string;
  onDelete?: () => void;
}) => (
  <div className="flex shrink-0 items-center gap-3 border-border border-b px-4 py-3">
    <ConnectorLogo className="size-6 shrink-0" fallback={Box} name={componentName as ComponentName} />
    <div className="flex min-w-0 flex-col">
      <Text as="span" className="text-muted-foreground uppercase tracking-wide" variant="captionStrongMedium">
        {kindLabel}
      </Text>
      <Text as="span" className="min-w-0 truncate font-semibold" title={componentName} variant="bodyStrongMedium">
        {componentName}
      </Text>
    </div>
    <div className="ml-auto flex shrink-0 items-center gap-0.5">
      {docsUrl ? (
        <Button
          aria-label={`${componentName} documentation`}
          as="a"
          href={docsUrl}
          rel="noopener noreferrer"
          size="icon-sm"
          target="_blank"
          variant="ghost"
        >
          <BookOpenIcon />
        </Button>
      ) : null}
      {onDelete ? (
        <Button aria-label="Remove node" onClick={onDelete} size="icon-sm" variant="ghost">
          <Trash2 />
        </Button>
      ) : null}
    </div>
  </div>
);

// Read-only inspection (view lane): the component as scoped YAML.
const ReadOnlyComponent = ({ component }: { component: Record<string, unknown> }) => (
  <div className="min-h-0 flex-1 p-4">
    <div className="h-full overflow-hidden rounded-md border border-border">
      <YamlEditor
        options={{ readOnly: true, domReadOnly: true, minimap: { enabled: false } }}
        transparentBackground
        value={yamlStringify(component)}
      />
    </div>
  </div>
);

// Fallback editor for components without a known schema (e.g. bloblang mappings):
// the component as scoped, editable YAML.
const RawComponentEditor = ({
  component,
  onApply,
}: {
  component: Record<string, unknown>;
  onApply: (next: Record<string, unknown>) => void;
}) => {
  const initial = useMemo(() => yamlStringify(component), [component]);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
    setError(null);
  }, [initial]);

  const apply = () => {
    let parsed: unknown;
    try {
      parsed = parseYaml(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid YAML');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Configuration must be a YAML mapping.');
      return;
    }
    setError(null);
    onApply(parsed as Record<string, unknown>);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 p-4">
        <div className="h-full overflow-hidden rounded-md border border-border">
          <YamlEditor
            onChange={(v) => {
              setDraft(v || '');
              setError(null);
            }}
            options={{ minimap: { enabled: false } }}
            transparentBackground
            value={draft}
          />
        </div>
        {error ? (
          <Text className="mt-2 text-destructive" variant="bodySmall">
            {error}
          </Text>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-border border-t px-4 py-3">
        <Button disabled={draft === initial} onClick={apply} type="button">
          Apply changes
        </Button>
      </div>
    </div>
  );
};
