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
import { Button } from 'components/redpanda-ui/components/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { extractSecretReferences, getUniqueSecretNames } from 'components/ui/secret/secret-detection';
import { KeyRound, Redo2, Undo2 } from 'lucide-react';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useListSecretsQuery } from 'react-query/api/secret';
import { isMacOS } from 'utils/platform';

import { NodeInspector } from './node-inspector';
import { PipelineFlowCanvas } from './pipeline-flow-canvas';
import { type PipelineProblem, PipelineProblemsPanel } from './pipeline-problems-panel';
import { TemplateGalleryCta } from './template-cta';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import { AddSecretsDialog } from '../onboarding/add-secrets-dialog';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { changedNodeIds } from '../utils/pipeline-diff';
import { type FlowInsertPayload, parsePipelineFlowTree } from '../utils/pipeline-flow-parser';
import { mapLintHintsToNodes } from '../utils/pipeline-lint';
import {
  appendResource,
  buildInsertableComponent,
  createResourceAndReturnLabel,
  type EditTarget,
  firstKey,
  getComponentAt,
  insertComponentAt,
  type ResourceArrayKey,
  type ResourceKind,
  removeComponentAt,
  setComponentAt,
} from '../utils/yaml';

// What the insertion (+) affordance offers: pipeline steps and the resources
// they reference. Passed to AddConnectorDialog's type filter.
const INSERTABLE_TYPES = ['processor', 'cache', 'rate_limit'] satisfies ConnectComponentType[];

// Where a chosen connector should land: a top-level spine slot (insert into
// pipeline.processors at an index) or a nested container slot (insert into an
// arbitrary YAML array — a switch case, branch, broker, fallback).
type PendingInsert =
  | { context: 'spine'; index: number }
  | { context: 'slot'; containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output'; index: number }
  // Output-switch "add case": pick an output, then wrap it as a new `{ check, output }` case.
  | { context: 'switchCaseOutput'; containerPath: (string | number)[] }
  // "Create new resource" from a node's resource field: pick the cache/rate_limit impl,
  // create the resource, and link it to `target`'s `resource:` field.
  | { context: 'resourceForNode'; kind: ResourceKind; target: EditTarget };

type InsertParams = {
  yaml: string;
  connectionName: string;
  connectionType: ConnectComponentType;
  target: PendingInsert;
  components: ConnectComponentSpec[];
};

// Resolve the chosen connector + insertion target to the next YAML (or null if the
// component couldn't be generated). Caches and rate limits always append to their
// top-level resource arrays (they're referenced, not nested); every other component
// splices into the target container array.
function buildInsertedYaml({ yaml, connectionName, connectionType, target, components }: InsertParams): string | null {
  // Output-switch case: wrap the chosen output in a `{ check, output }` case (default
  // condition; edited afterwards) appended to the switch's cases.
  if (target.context === 'switchCaseOutput') {
    if (connectionType !== 'output') {
      return null;
    }
    const output = buildInsertableComponent(connectionName, 'output', components);
    return output
      ? insertComponentAt(yaml, target.containerPath, Number.MAX_SAFE_INTEGER, { check: '', output })
      : null;
  }
  // Create the chosen cache/rate_limit resource and link it to the node's `resource:`
  // field in one commit — so the new resource is never left unlinked.
  if (target.context === 'resourceForNode') {
    if (connectionType !== target.kind) {
      return null;
    }
    const created = createResourceAndReturnLabel(yaml, target.kind, connectionName, components);
    if (!created) {
      return null;
    }
    const comp = getComponentAt(created.yaml, target.target);
    const name = comp ? firstKey(comp) : undefined;
    const inner = name ? comp?.[name] : undefined;
    if (comp && name && inner && typeof inner === 'object' && !Array.isArray(inner)) {
      (inner as Record<string, unknown>).resource = created.label;
      return setComponentAt(created.yaml, target.target, comp) ?? created.yaml;
    }
    return created.yaml;
  }
  if (connectionType === 'cache' || connectionType === 'rate_limit') {
    const resource = buildInsertableComponent(connectionName, connectionType, components);
    const resourceKey: ResourceArrayKey = connectionType === 'cache' ? 'cache_resources' : 'rate_limit_resources';
    return resource ? appendResource(yaml, resourceKey, resource) : null;
  }
  if (connectionType === 'processor' || connectionType === 'input' || connectionType === 'output') {
    const component = buildInsertableComponent(connectionName, connectionType, components);
    if (!component) {
      return null;
    }
    // The target here is a spine or slot insert — both carry an index, and the spine
    // targets the top-level processors array.
    const containerPath = target.context === 'slot' ? target.containerPath : ['pipeline', 'processors'];
    return insertComponentAt(yaml, containerPath, target.index, component);
  }
  return null;
}

// Keyboard shortcuts shown in the undo/redo tooltips, using the conventions of the
// user's platform (⌘ on macOS, Ctrl elsewhere).
const MAC = isMacOS();
const UNDO_SHORTCUT = MAC ? '⌘Z' : 'Ctrl+Z';
const REDO_SHORTCUT = MAC ? '⌘⇧Z' : 'Ctrl+Shift+Z';

const ShortcutLabel = ({ label, keys }: { label: string; keys: string }) => (
  <span className="flex items-center gap-2">
    {label}
    <kbd className="rounded bg-foreground/15 px-1 py-0.5 font-medium text-[11px]">{keys}</kbd>
  </span>
);

// Classify a canvas keydown, ignoring presses inside a text field or the Monaco
// YAML editor (which have their own undo / editing semantics).
type CanvasKeyAction = 'undo' | 'redo' | 'deselect' | 'delete';

function canvasKeyAction(e: KeyboardEvent): CanvasKeyAction | null {
  if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"], .monaco-editor')) {
    return null;
  }
  if (e.key === 'Escape') {
    return 'deselect';
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    return 'delete';
  }
  if (!(e.metaKey || e.ctrlKey)) {
    return null;
  }
  const key = e.key.toLowerCase();
  if (key === 'y' || (key === 'z' && e.shiftKey)) {
    return 'redo';
  }
  if (key === 'z') {
    return 'undo';
  }
  return null;
}

// Undo/redo for visual edits: the YAML lane has Monaco's native undo, but visual
// mutations write YAML directly. This records each YAML change (from the canvas or
// elsewhere) into a history so the visual editor gets ⌘Z / ⌘⇧Z too.
function useEditHistory(
  yaml: string,
  onChange: (next: string) => void,
  onNavigate?: (from: string, to: string) => void
) {
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const navigatingRef = useRef(false);
  const currentRef = useRef(yaml);

  useEffect(() => {
    if (yaml === currentRef.current) {
      return;
    }
    if (navigatingRef.current) {
      // This change came from undo/redo — don't record it as a new step.
      navigatingRef.current = false;
    } else {
      setPast((p) => [...p, currentRef.current]);
      setFuture([]);
    }
    currentRef.current = yaml;
  }, [yaml]);

  const undo = useCallback(() => {
    if (past.length === 0) {
      return;
    }
    const current = currentRef.current;
    const target = past.at(-1) as string;
    navigatingRef.current = true;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [current, ...f]);
    onChange(target);
    onNavigate?.(current, target);
  }, [past, onChange, onNavigate]);

  const redo = useCallback(() => {
    if (future.length === 0) {
      return;
    }
    const current = currentRef.current;
    const target = future[0];
    navigatingRef.current = true;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, current]);
    onChange(target);
    onNavigate?.(current, target);
  }, [future, onChange, onNavigate]);

  return { undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
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
  const [pendingInsert, setPendingInsert] = useState<PendingInsert | null>(null);

  // Briefly pulse the node(s) an undo/redo touched, so the change is easy to spot.
  const [flash, setFlash] = useState<{ ids: ReadonlySet<string>; token: number }>({ ids: new Set(), token: 0 });
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleNavigate = useCallback((from: string, to: string) => {
    const ids = changedNodeIds(from, to);
    if (ids.length === 0) {
      return;
    }
    setFlash((f) => ({ ids: new Set(ids), token: f.token + 1 }));
    if (flashTimer.current) {
      clearTimeout(flashTimer.current);
    }
    flashTimer.current = setTimeout(() => setFlash((f) => ({ ids: new Set(), token: f.token })), 1400);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current ?? undefined), []);

  const { undo, redo, canUndo, canRedo } = useEditHistory(yamlContent, onYamlChange, handleNavigate);

  const flowNodes = useMemo(() => parsePipelineFlowTree(yamlContent).nodes, [yamlContent]);

  // A freshly-started pipeline (only section labels / `none` placeholders) gets the
  // floating "Start from a template" entry point.
  const isPipelineEmpty = useMemo(
    () => !flowNodes.some((n) => n.kind === 'group' || (n.kind === 'leaf' && n.label !== 'none')),
    [flowNodes]
  );

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

  // A flat problems list for the floating overview: hints that map to a node are
  // clickable (select the node); the rest are listed inert.
  const problems = useMemo<PipelineProblem[]>(() => {
    const all = lintHints ?? [];
    if (all.length === 0) {
      return [];
    }
    const nodesById = new Map(flowNodes.map((n) => [n.id, n]));
    const mapped = new Set<LintHint>();
    const list: PipelineProblem[] = [];
    for (const [nodeId, hints] of lintByNode) {
      const node = nodesById.get(nodeId);
      for (const hint of hints) {
        mapped.add(hint);
        list.push({
          key: `${nodeId}-${hint.line}-${hint.hint}`,
          message: hint.hint,
          line: hint.line || undefined,
          nodeId,
          nodeLabel: node?.label,
          target: node?.editTarget,
        });
      }
    }
    for (const hint of all) {
      if (!mapped.has(hint)) {
        list.push({ key: `unmapped-${hint.line}-${hint.hint}`, message: hint.hint, line: hint.line || undefined });
      }
    }
    return list;
  }, [lintHints, lintByNode, flowNodes]);

  // Secrets referenced as ${secrets.X} that don't exist yet — surfaced as a banner
  // with a quick-add flow, so a pasted/templated config is easy to complete.
  const { data: secretsResponse } = useListSecretsQuery({}, { enabled: isEditing });
  const [isSecretsDialogOpen, setIsSecretsDialogOpen] = useState(false);
  const existingSecrets = useMemo(
    () => (secretsResponse?.secrets ? secretsResponse.secrets.map((s) => s?.id || '').filter(Boolean) : []),
    [secretsResponse]
  );
  const missingSecrets = useMemo(() => {
    // Only warn once the secrets list has actually loaded.
    if (!(isEditing && secretsResponse)) {
      return [];
    }
    const referenced = getUniqueSecretNames(extractSecretReferences(yamlContent));
    const existingSet = new Set(existingSecrets);
    return referenced.filter((name) => !existingSet.has(name));
  }, [isEditing, secretsResponse, yamlContent, existingSecrets]);

  // Renaming a missing secret to an existing one from the dialog rewrites the
  // references in the pipeline YAML (the visual lane has no text editor to patch).
  const handleRenameSecretReferences = useCallback(
    (oldName: string, newName: string) => {
      const updated = yamlContent.replaceAll(`\${secrets.${oldName}}`, `\${secrets.${newName}}`);
      if (updated !== yamlContent) {
        onYamlChange(updated);
      }
    },
    [yamlContent, onYamlChange]
  );

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

  // Canvas keyboard: ⌘Z/⌘⇧Z undo/redo, Escape deselects, Delete/Backspace removes
  // the selected node — all ignored while typing in a field or the YAML editor.
  useEffect(() => {
    const handlers: Record<CanvasKeyAction, (e: KeyboardEvent) => void> = {
      deselect: () => setSelected(null),
      delete: (e) => {
        if (isEditing && selected) {
          e.preventDefault();
          handleDeleteNode(selected.target);
        }
      },
      undo: (e) => {
        if (isEditing) {
          e.preventDefault();
          undo();
        }
      },
      redo: (e) => {
        if (isEditing) {
          e.preventDefault();
          redo();
        }
      },
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const action = canvasKeyAction(e);
      if (action) {
        handlers[action](e);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditing, undo, redo, selected, handleDeleteNode]);

  const handleInsertSelected = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      const target = pendingInsert;
      setPendingInsert(null);
      if (target === null) {
        return;
      }
      const next = buildInsertedYaml({ yaml: yamlContent, connectionName, connectionType, target, components });
      if (next !== null) {
        onYamlChange(next);
      }
    },
    [pendingInsert, components, yamlContent, onYamlChange]
  );

  // The in-container "+" affordances: open the picker filtered to the slot's type, or
  // — for a switch — append a fresh structural case directly (no component to pick).
  const handleSlotInsert = useCallback(
    (payload: FlowInsertPayload) => {
      if (payload.kind === 'addChild') {
        // A processor switch grows an empty case (its condition + processors are edited
        // after); an output switch needs an output picked first, then wrapped in a case.
        if (payload.section === 'output') {
          setPendingInsert({ context: 'switchCaseOutput', containerPath: payload.containerPath });
          return;
        }
        const next = insertComponentAt(yamlContent, payload.containerPath, Number.MAX_SAFE_INTEGER, {
          check: '',
          processors: [],
        });
        if (next !== null) {
          onYamlChange(next);
        }
        return;
      }
      setPendingInsert({
        context: 'slot',
        containerPath: payload.containerPath,
        accepts: payload.accepts,
        index: payload.index,
      });
    },
    [yamlContent, onYamlChange]
  );

  // "Create new resource" from a node's resource field: open the picker filtered to the
  // resource kind (memory/redis/memcached, …); the pick is created and linked together.
  const handleRequestCreateResource = useCallback(
    (kind: ResourceKind) => {
      if (selected) {
        setPendingInsert({ context: 'resourceForNode', kind, target: selected.target });
      }
    },
    [selected]
  );

  // The slot dictates which component types the picker offers: a nested slot accepts
  // exactly its kind; an output-switch case accepts outputs; a resource link accepts its
  // resource kind; the top-level spine also offers cache/rate-limit resources.
  let insertTypes: ConnectComponentType[] = INSERTABLE_TYPES;
  if (pendingInsert?.context === 'slot') {
    insertTypes = [pendingInsert.accepts];
  } else if (pendingInsert?.context === 'switchCaseOutput') {
    insertTypes = ['output'];
  } else if (pendingInsert?.context === 'resourceForNode') {
    insertTypes = [pendingInsert.kind];
  }

  // The picker's title/placeholder adapt to what's being added.
  const isResourceInsert = pendingInsert?.context === 'resourceForNode';
  const insertTitle = isResourceInsert
    ? `Add ${pendingInsert.kind === 'cache' ? 'cache' : 'rate limit'} resource`
    : 'Insert a step';

  return (
    <div className="flex h-full w-full">
      <div className="relative min-w-0 flex-1">
        <PipelineFlowCanvas
          configYaml={yamlContent}
          flashNodeIds={flash.ids}
          flashToken={flash.token}
          lintErrorsByNode={lintMessagesByNode}
          onAddConnector={
            isEditing && onAddConnector ? (section) => onAddConnector(section as ConnectComponentType) : undefined
          }
          onAddSasl={isEditing ? onAddSasl : undefined}
          onAddTopic={isEditing ? onAddTopic : undefined}
          onClearSelection={() => setSelected(null)}
          onInsert={isEditing ? (index) => setPendingInsert({ context: 'spine', index }) : undefined}
          onSelectNode={(id, target) => setSelected({ id, target })}
          onSlotInsert={isEditing ? handleSlotInsert : undefined}
          selectedNodeId={selected?.id}
        />
        {isEditing ? (
          <TooltipProvider>
            <div className="absolute top-3 left-3 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button aria-label="Undo" disabled={!canUndo} onClick={undo} size="icon-sm" variant="ghost">
                    <Undo2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <ShortcutLabel keys={UNDO_SHORTCUT} label="Undo" />
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button aria-label="Redo" disabled={!canRedo} onClick={redo} size="icon-sm" variant="ghost">
                    <Redo2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <ShortcutLabel keys={REDO_SHORTCUT} label="Redo" />
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        ) : null}
        <PipelineProblemsPanel onSelectProblem={(id, target) => setSelected({ id, target })} problems={problems} />
        {missingSecrets.length > 0 ? (
          <button
            className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-md border border-warning/50 bg-background/90 px-2.5 py-1.5 font-medium text-warning text-xs shadow-sm backdrop-blur-sm transition-colors hover:bg-warning-subtle"
            data-testid="missing-secrets-banner"
            onClick={() => setIsSecretsDialogOpen(true)}
            type="button"
          >
            <KeyRound className="size-3.5" />
            {missingSecrets.length === 1
              ? `Missing secret: ${missingSecrets[0]}`
              : `${missingSecrets.length} missing secrets`}
            <span className="underline underline-offset-2">Add</span>
          </button>
        ) : null}
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
            onCreateResource={isEditing ? handleRequestCreateResource : undefined}
            onDelete={isEditing ? handleDeleteNode : undefined}
            readOnly={!isEditing}
            target={selected?.target ?? null}
            yaml={yamlContent}
          />
        </div>
      </aside>

      <AddConnectorDialog
        components={componentList}
        connectorType={insertTypes}
        isOpen={pendingInsert !== null}
        onAddConnector={handleInsertSelected}
        onCloseAddConnector={() => setPendingInsert(null)}
        searchPlaceholder={isResourceInsert ? 'Search caches, rate limits…' : 'Search components…'}
        title={insertTitle}
      />

      <AddSecretsDialog
        existingSecrets={existingSecrets}
        isOpen={isSecretsDialogOpen}
        missingSecrets={missingSecrets}
        onClose={() => setIsSecretsDialogOpen(false)}
        onSecretsCreated={() => setIsSecretsDialogOpen(false)}
        onUpdateEditorContent={handleRenameSecretReferences}
      />
    </div>
  );
}
