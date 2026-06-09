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

import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useState } from 'react';

import { NodeConfigDialog } from './node-config-dialog';
import { PipelineFlowCanvas } from './pipeline-flow-canvas';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
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
  /** Reused page flows (edit mode only): add input/output placeholders, redpanda setup hints. */
  onAddConnector?: (type: ConnectComponentType | 'resource') => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
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
  onAddConnector,
  onAddTopic,
  onAddSasl,
}: VisualEditorPanelProps) {
  const isEditing = mode !== 'view';
  const [configTarget, setConfigTarget] = useState<EditTarget | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  const handleDeleteNode = useCallback(
    (target: EditTarget) => {
      const next = removeComponentAt(yamlContent, target);
      if (next !== null) {
        onYamlChange(next);
      }
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
    <div className="h-full w-full">
      <PipelineFlowCanvas
        configYaml={yamlContent}
        onAddConnector={
          isEditing && onAddConnector ? (section) => onAddConnector(section as ConnectComponentType) : undefined
        }
        onAddSasl={isEditing ? onAddSasl : undefined}
        onAddTopic={isEditing ? onAddTopic : undefined}
        onDeleteNode={isEditing ? handleDeleteNode : undefined}
        onEditNode={isEditing ? setConfigTarget : undefined}
        onInsert={isEditing ? setInsertIndex : undefined}
      />

      <NodeConfigDialog
        components={components}
        onChange={onYamlChange}
        onOpenChange={(open) => {
          if (!open) {
            setConfigTarget(null);
          }
        }}
        open={configTarget !== null}
        target={configTarget}
        yaml={yamlContent}
      />

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
