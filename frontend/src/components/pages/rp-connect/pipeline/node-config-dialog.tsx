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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Text } from 'components/redpanda-ui/components/typography';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { useEffect, useMemo, useState } from 'react';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';

import { NodeConfigForm } from './node-config-form';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { type EditTarget, firstKey, getComponentAt, setComponentAt } from '../utils/yaml';

const TARGET_LABEL: Record<EditTarget['kind'], string> = {
  input: 'Input',
  output: 'Output',
  processor: 'Processor',
  resource: 'Resource',
};

function targetComponentType(target: EditTarget): ConnectComponentType {
  switch (target.kind) {
    case 'input':
      return 'input';
    case 'output':
      return 'output';
    case 'processor':
      return 'processor';
    default:
      return target.resourceKey === 'cache_resources' ? 'cache' : 'rate_limit';
  }
}

type NodeConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which component to edit. `null` while closed. */
  target: EditTarget | null;
  /** Canonical pipeline YAML; the component is read from / written back to it. */
  yaml: string;
  onChange: (yaml: string) => void;
  /** Component specs, used to drive the schema form. */
  components: ConnectComponentSpec[];
  /** Read-only view (no Save); used from the read-only view lane. */
  readOnly?: boolean;
};

/**
 * Edits a single component. When the component's schema is known, renders a
 * field-based form (with a raw-YAML fallback for nested settings); otherwise
 * (or in read-only mode) shows the component as scoped YAML. Either way the
 * change is written back into the canonical pipeline YAML at `target`.
 */
export function NodeConfigDialog({
  open,
  onOpenChange,
  target,
  yaml,
  onChange,
  components,
  readOnly,
}: NodeConfigDialogProps) {
  const component = useMemo(() => (target ? getComponentAt(yaml, target) : undefined), [yaml, target]);
  const componentName = component ? firstKey(component) : undefined;

  const spec = useMemo(() => {
    if (!(target && componentName)) {
      return;
    }
    const type = targetComponentType(target);
    return components.find((c) => c.type === type && c.name === componentName);
  }, [components, target, componentName]);

  const useFormEditor = !readOnly && Boolean(component && componentName && (spec?.config?.children?.length ?? 0) > 0);

  const title = target
    ? `${readOnly ? '' : 'Edit '}${TARGET_LABEL[target.kind]}${componentName ? `: ${componentName}` : ''}`
    : '';

  const handleFormSubmit = (next: Record<string, unknown>) => {
    if (!target) {
      return;
    }
    const updated = setComponentAt(yaml, target, next);
    if (updated !== null) {
      onChange(updated);
    }
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[85vh] flex-col" size="lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {useFormEditor && spec && component && componentName ? (
          <NodeConfigForm
            componentName={componentName}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleFormSubmit}
            spec={spec}
            value={component}
          />
        ) : (
          <RawYamlEditor
            component={component}
            onChange={onChange}
            onClose={() => onOpenChange(false)}
            readOnly={readOnly}
            target={target}
            yaml={yaml}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Fallback editor: the component as scoped YAML. Used for read-only viewing and
// for components whose schema we don't have (e.g. bloblang mappings, custom).
function RawYamlEditor({
  component,
  target,
  yaml,
  onChange,
  onClose,
  readOnly,
}: {
  component: Record<string, unknown> | undefined;
  target: EditTarget | null;
  yaml: string;
  onChange: (yaml: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(component ? yamlStringify(component) : '');
    setError(null);
  }, [component]);

  const handleSave = () => {
    if (!target) {
      return;
    }
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
    const next = setComponentAt(yaml, target, parsed as Record<string, unknown>);
    if (next === null) {
      setError('Could not apply the change.');
      return;
    }
    onChange(next);
    onClose();
  };

  return (
    <>
      <DialogBody>
        <div className="h-[420px] overflow-hidden rounded-md border border-border">
          <YamlEditor
            onChange={(value) => {
              setDraft(value || '');
              setError(null);
            }}
            options={{ readOnly, domReadOnly: readOnly, minimap: { enabled: false } }}
            transparentBackground
            value={draft}
          />
        </div>
        {error ? (
          <Text className="mt-2 text-destructive" variant="bodySmall">
            {error}
          </Text>
        ) : null}
      </DialogBody>
      {readOnly ? null : (
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      )}
    </>
  );
}
