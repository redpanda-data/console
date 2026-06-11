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

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useMemo, useState } from 'react';

import { NodeInspector } from './node-inspector';
import { PipelineFlowCanvas } from './pipeline-flow-canvas';
import { TemplateGalleryCta } from './template-cta';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { parsePipelineFlowTree } from '../utils/pipeline-flow-parser';
import { mapLintHintsToNodes } from '../utils/pipeline-lint';
import {
  appendResource,
  buildInsertableComponent,
  type EditTarget,
  insertProcessorAt,
  removeComponentAt,
} from '../utils/yaml';

// What the insertion (+) affordance offers: pipeline steps and the resources
// they reference. Passed to AddConnectorDialog's type filter.
const INSERTABLE_TYPES = ['processor', 'cache', 'rate_limit'] satisfies ConnectComponentType[];

type InsertParams = {
  yaml: string;
  connectionName: string;
  connectionType: ConnectComponentType;
  processorIndex: number;
  components: ConnectComponentSpec[];
};

// Resolve the chosen connector + insertion index to the next YAML (or null if the
// component couldn't be generated). Processors insert by index; caches and rate
// limits append to their resource arrays.
function buildInsertedYaml({
  yaml,
  connectionName,
  connectionType,
  processorIndex,
  components,
}: InsertParams): string | null {
  if (connectionType === 'processor') {
    const processor = buildInsertableComponent(connectionName, 'processor', components);
    return processor ? insertProcessorAt(yaml, processorIndex, processor) : null;
  }
  if (connectionType === 'cache' || connectionType === 'rate_limit') {
    const resource = buildInsertableComponent(connectionName, connectionType, components);
    const resourceKey = connectionType === 'cache' ? 'cache_resources' : 'rate_limit_resources';
    return resource ? appendResource(yaml, resourceKey, resource) : null;
  }
  return null;
}

type VisualEditorPanelProps = {
  mode: 'view' | 'edit' | 'create';
  yamlContent: string;
  onYamlChange: (yaml: string) => void;
  /** Parsed component specs, used to generate templates for inserted components. */
  components: ConnectComponentSpec[];
  /** Raw component list for the connector picker. */
  componentList: ComponentList;
  /** Server lint hints, surfaced in context on the nodes they map to. */
  lintHints?: LintHint[];
  /** Reused page flows (edit mode only): add input/output placeholders, redpanda setup hints. */
  onAddConnector?: (type: ConnectComponentType | 'resource') => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
  /** Open the template gallery (edit mode); shows a floating entry point when empty. */
  onBrowseTemplates?: () => void;
};

/**
 * The Visual lane: a full-size, pannable canvas that lays the pipeline out as a
 * left→right flow. In edit mode it overlays contextual actions — add
 * input/output, insert a step on the spine, and per-node edit/remove — all of
 * which mutate the canonical YAML.
 */
export function VisualEditorPanel({
  mode,
  yamlContent,
  onYamlChange,
  components,
  componentList,
  lintHints,
  onAddConnector,
  onAddTopic,
  onAddSasl,
  onBrowseTemplates,
}: VisualEditorPanelProps) {
  const isEditing = mode !== 'view';
  const [selected, setSelected] = useState<{ id: string; target: EditTarget } | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  // A freshly-started pipeline (only section labels / `none` placeholders) gets the
  // floating "Start from a template" entry point.
  const isPipelineEmpty = useMemo(() => {
    const { nodes } = parsePipelineFlowTree(yamlContent);
    return !nodes.some((n) => n.kind === 'group' || (n.kind === 'leaf' && n.label !== 'none'));
  }, [yamlContent]);

  // Associate server lint hints with the nodes they belong to, so they show in
  // context (a badge on the node, full messages in the inspector).
  const lintByNode = useMemo(() => mapLintHintsToNodes(yamlContent, lintHints ?? []), [yamlContent, lintHints]);
  const lintMessagesByNode = useMemo(() => {
    const messages = new Map<string, string[]>();
    for (const [id, hints] of lintByNode) {
      messages.set(
        id,
        hints.map((h) => h.hint)
      );
    }
    return messages;
  }, [lintByNode]);

  const handleDeleteNode = useCallback(
    (target: EditTarget) => {
      const next = removeComponentAt(yamlContent, target);
      if (next !== null) {
        onYamlChange(next);
      }
      setSelected(null);
    },
    [yamlContent, onYamlChange]
  );

  const handleInsertSelected = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      const processorIndex = insertIndex;
      setInsertIndex(null);
      if (processorIndex === null) {
        return;
      }
      const next = buildInsertedYaml({ yaml: yamlContent, connectionName, connectionType, processorIndex, components });
      if (next !== null) {
        onYamlChange(next);
      }
    },
    [insertIndex, components, yamlContent, onYamlChange]
  );

  return (
    <div className="flex h-full w-full">
      <div className="relative min-w-0 flex-1">
        <PipelineFlowCanvas
          configYaml={yamlContent}
          lintErrorsByNode={lintMessagesByNode}
          onAddConnector={
            isEditing && onAddConnector ? (section) => onAddConnector(section as ConnectComponentType) : undefined
          }
          onAddSasl={isEditing ? onAddSasl : undefined}
          onAddTopic={isEditing ? onAddTopic : undefined}
          onClearSelection={() => setSelected(null)}
          onInsert={isEditing ? setInsertIndex : undefined}
          onSelectNode={(id, target) => setSelected({ id, target })}
          selectedNodeId={selected?.id}
        />
        {onBrowseTemplates ? (
          <TemplateGalleryCta
            className="right-auto bottom-6 left-1/2 w-80 max-w-[calc(100%-2rem)] -translate-x-1/2"
            onBrowseTemplates={onBrowseTemplates}
            show={isEditing && isPipelineEmpty}
          />
        ) : null}
      </div>

      {/* Always-present inspector rail (Figma-style): the selected node's config.
          The content is absolutely positioned so the rail never grows the editor
          region to fit its content — it stays the canvas height and scrolls. */}
      <aside className="relative w-96 shrink-0 border-border border-l bg-background">
        <div className="absolute inset-0 flex flex-col overflow-hidden">
          <NodeInspector
            components={components}
            lintHints={selected ? lintByNode.get(selected.id) : undefined}
            onApply={onYamlChange}
            onDelete={isEditing ? handleDeleteNode : undefined}
            readOnly={!isEditing}
            target={selected?.target ?? null}
            yaml={yamlContent}
          />
        </div>
      </aside>

      <AddConnectorDialog
        components={componentList}
        connectorType={INSERTABLE_TYPES}
        isOpen={insertIndex !== null}
        onAddConnector={handleInsertSelected}
        onCloseAddConnector={() => setInsertIndex(null)}
        searchPlaceholder="Search processors, caches, rate limits…"
        title="Insert a step"
      />
    </div>
  );
}
