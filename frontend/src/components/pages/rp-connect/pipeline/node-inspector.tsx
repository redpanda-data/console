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
import type { ComponentName } from 'assets/connectors/component-logo-map';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import {
  AlertCircle,
  BookOpenIcon,
  Box,
  EllipsisVertical,
  FileCode2,
  Info,
  type LucideIcon,
  MousePointerClick,
  MousePointerSquareDashed,
  Plus,
  Split,
  Trash2,
  X,
} from 'lucide-react';
import { type MutableRefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LineCounter, parseDocument, parse as parseYaml, stringify as yamlStringify } from 'yaml';

import { ChildItemsList, type InspectorChildItem, NodeConfigForm, type ResourceKind } from './node-config-form';
import { getConnectorDocsUrl } from './pipeline-flow-nodes';
import { ConnectorLogo } from '../onboarding/connector-logo';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import {
  appendResource,
  buildInsertableComponent,
  countResourceReferences,
  type EditTarget,
  editTargetPath,
  firstKey,
  getComponentAt,
  listResourceLabels,
  renameResourceReferences,
  resourceTargetKind,
  setComponentAt,
} from '../utils/yaml';

// Default impl for the dangling-reference quick-fix, which must reuse the exact missing label.
const DEFAULT_RESOURCE_COMPONENT: Record<ResourceKind, string> = { cache: 'memory', rate_limit: 'local' };

const COMPONENT_TYPE_LABEL: Partial<Record<ConnectComponentType, string>> = {
  input: 'Input',
  output: 'Output',
  processor: 'Processor',
  cache: 'Cache',
  rate_limit: 'Rate limit',
  buffer: 'Buffer',
  metrics: 'Metrics',
  tracer: 'Tracer',
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
    case 'switchCase':
      // Never used for rendering (the inspector special-cases switchCase first).
      return 'processor';
    default:
      return target.resourceKey === 'cache_resources' ? 'cache' : 'rate_limit';
  }
}

type NodeInspectorProps = {
  target: EditTarget | null;
  /** For a switch-case entry node: the case's routing-condition target, shown at the top of the panel. */
  caseTarget?: EditTarget | null;
  /** Canonical pipeline YAML — read from and written back to. */
  yaml: string;
  /** Component specs, used to drive the schema form. */
  components: ConnectComponentSpec[];
  onApply: (yaml: string) => void;
  onDelete?: (target: EditTarget) => void;
  /** Open the picker to create + link a new resource of a kind (memory/redis/memcached…). */
  onCreateResource?: (kind: ResourceKind) => void;
  /** Read-only inspection (view lane): show config without editing. */
  readOnly?: boolean;
  /** Lint problems that map to the selected node. */
  lintHints?: LintHint[];
  /** Jump to this node's lines in the YAML lane (footer "View in YAML" action). */
  onOpenInYaml?: () => void;
  /** Close the inspector (deselect). */
  onClose?: () => void;
  /** A control-flow node's direct children (cases / steps), shown as a clickable list. */
  childItems?: InspectorChildItem[];
  /** Navigate the inspector to a child node. */
  onSelectChild?: (item: InspectorChildItem) => void;
  /** The selected node's pending-edit hooks; the panel flushes them on node-leave / save — no per-node Apply button. */
  commitRef?: MutableRefObject<PendingNodeCommit | null>;
};

/** The inspector's pending-edit hooks, registered into the panel's `commitRef`. */
export type PendingNodeCommit = {
  /** Apply the node's pending edits into `yaml` and consume them (idempotent once consumed). */
  commit: (yaml: string) => string;
  /** Drop the pending edits without applying (delete / undo / redo). */
  discard: () => void;
};

// Lint message falling on a switch case's routing `check` line, so the condition field can show its own error.
function lintMessageOnCaseCheck(yaml: string, caseTarget: EditTarget, lintHints?: LintHint[]): string | undefined {
  if (!lintHints?.length) {
    return;
  }
  try {
    const lineCounter = new LineCounter();
    const doc = parseDocument(yaml, { lineCounter });
    const checkNode = doc.getIn([...editTargetPath(caseTarget), 'check'], true) as
      | { range?: [number, number, number] }
      | undefined;
    if (!checkNode?.range) {
      return;
    }
    const line = lineCounter.linePos(checkNode.range[0]).line;
    return lintHints.find((h) => h.line === line)?.hint;
  } catch {
    return;
  }
}

/**
 * The always-present right rail: the selected node's identity plus either a schema-driven form
 * or scoped YAML (read-only / unknown schema). Edits write back into the pipeline YAML at `target`.
 */
export function NodeInspector({
  target,
  caseTarget,
  yaml,
  components,
  onApply,
  onCreateResource,
  onDelete,
  readOnly,
  lintHints,
  onOpenInYaml,
  onClose,
  childItems,
  onSelectChild,
  commitRef,
}: NodeInspectorProps) {
  const component = useMemo(() => (target ? getComponentAt(yaml, target) : undefined), [yaml, target]);
  // The routing condition for a case-entry node, read from its switch case.
  const caseObject = useMemo(() => (caseTarget ? getComponentAt(yaml, caseTarget) : undefined), [yaml, caseTarget]);

  // Pending edits from the active editors (null when clean). Refs, not state, so per-keystroke
  // reporting doesn't re-render. `component` applies at `target`; `condition` at `caseTarget`.
  const componentDraftRef = useRef<Record<string, unknown> | null>(null);
  const conditionDraftRef = useRef<Record<string, unknown> | null>(null);
  // The resource's original label, captured for the rename cascade when committing a resource edit.
  const resourceLabel0 =
    target?.kind === 'resource' && component && typeof component.label === 'string' ? component.label : undefined;

  // Commit all pending edits into `yaml`, condition before component (the condition replaces the
  // whole case, so writing it first avoids clobbering the component). Consumes drafts as applied,
  // so re-calling is a no-op until the next edit.
  const commit = useCallback(
    (input: string): string => {
      let next = input;
      const cond = conditionDraftRef.current;
      if (cond && caseTarget) {
        const applied = setComponentAt(next, caseTarget, cond);
        if (applied === null) {
          // Surgical editor couldn't rewrite this YAML; keep the draft (next flush retries) and warn.
          toast.error('Couldn’t apply the condition edit to the YAML — edit it in the YAML view instead.');
        } else {
          next = applied;
          conditionDraftRef.current = null;
        }
      }
      const comp = componentDraftRef.current;
      if (comp && target) {
        const applied = applyComponentDraft(next, target, comp, resourceLabel0);
        if (applied !== null) {
          next = applied;
          componentDraftRef.current = null;
        }
      }
      return next;
    },
    [target, caseTarget, resourceLabel0]
  );
  useEffect(() => {
    if (!commitRef) {
      return;
    }
    commitRef.current = {
      commit,
      discard: () => {
        conditionDraftRef.current = null;
        componentDraftRef.current = null;
      },
    };
    return () => {
      commitRef.current = null;
    };
  }, [commit, commitRef]);
  // Clear pending drafts when the selected node changes — the inspector instance is reused.
  // biome-ignore lint/correctness/useExhaustiveDependencies: target/caseTarget are change triggers; the body only resets refs.
  useEffect(() => {
    componentDraftRef.current = null;
    conditionDraftRef.current = null;
  }, [target, caseTarget]);
  // Lint problem on the condition's `check` line, so the field shows its own error, not just the banner.
  const conditionError = useMemo(
    () => (caseTarget ? lintMessageOnCaseCheck(yaml, caseTarget, lintHints) : undefined),
    [yaml, caseTarget, lintHints]
  );
  const componentName = component ? firstKey(component) : undefined;

  const spec = useMemo(() => {
    if (!(target && componentName)) {
      return;
    }
    const type = targetComponentType(target);
    return components.find((c) => c.type === type && c.name === componentName);
  }, [components, target, componentName]);

  if (!(target && component && componentName)) {
    return <InspectorEmptyState readOnly={readOnly} />;
  }

  // A switch case is edited for its routing condition only; its body is separate nodes. Reported
  // as a draft (at `target`), auto-committed on leave / save.
  if (target.kind === 'switchCase') {
    return (
      <SwitchCaseEditor
        caseObject={component}
        onClose={onClose}
        onConfigChange={(next) => {
          componentDraftRef.current = next;
        }}
        onDelete={readOnly || !onDelete ? undefined : () => onDelete(target)}
        onOpenInYaml={onOpenInYaml}
        readOnly={readOnly}
      />
    );
  }

  const kind = targetComponentType(target);
  const kindLabel = COMPONENT_TYPE_LABEL[kind] ?? 'Component';
  const docsUrl = getConnectorDocsUrl(kind, componentName);
  const useForm = (spec?.config?.children?.length ?? 0) > 0;
  // Delete lives in the header's 3-dot menu — disabled in read-only or with no delete handler.
  const handleDelete = readOnly || !onDelete ? undefined : () => onDelete(target);

  // Resource label + reference count ("Used by N"). Kind-scoped: a same-labelled resource of the
  // other kind must not inflate the count.
  const resourceLabel = target.kind === 'resource' && typeof component.label === 'string' ? component.label : undefined;
  const usedByCount = resourceLabel ? countResourceReferences(yaml, resourceLabel, resourceTargetKind(target)) : 0;

  // Resource labels for the `resource:` dropdowns in this component's form.
  const resourceLabels: Record<ResourceKind, string[]> = {
    cache: listResourceLabels(yaml, 'cache'),
    rate_limit: listResourceLabels(yaml, 'rate_limit'),
  };

  // A `resource:` reference whose label has no matching resource — a fixable warning (it would
  // otherwise fail only at deploy).
  const refKind: ResourceKind | undefined =
    componentName === 'cache' ? 'cache' : componentName === 'rate_limit' ? 'rate_limit' : undefined;
  const innerConfig = component[componentName];
  const refValue =
    innerConfig && typeof innerConfig === 'object' && !Array.isArray(innerConfig)
      ? (innerConfig as Record<string, unknown>).resource
      : undefined;
  const danglingRef =
    refKind && typeof refValue === 'string' && refValue !== '' && !resourceLabels[refKind].includes(refValue)
      ? { ref: refValue, kind: refKind }
      : undefined;

  // Quick-fix: create the missing resource under that exact label so the reference resolves.
  const handleCreateMissingResource = () => {
    if (!danglingRef) {
      return;
    }
    const obj = buildInsertableComponent(DEFAULT_RESOURCE_COMPONENT[danglingRef.kind], danglingRef.kind, components);
    if (!obj) {
      return;
    }
    obj.label = danglingRef.ref;
    const key = danglingRef.kind === 'cache' ? 'cache_resources' : 'rate_limit_resources';
    onApply(appendResource(yaml, key, obj) ?? yaml);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InspectorHeader
        componentName={componentName}
        docsUrl={docsUrl}
        kindLabel={kindLabel}
        onClose={onClose}
        onDelete={handleDelete}
        onOpenInYaml={onOpenInYaml}
        usedByCount={resourceLabel ? usedByCount : undefined}
      />
      {lintHints && lintHints.length > 0 ? <InspectorLintErrors hints={lintHints} /> : null}
      {danglingRef && !readOnly ? (
        <DanglingRefBanner onCreate={handleCreateMissingResource} refLabel={danglingRef.ref} />
      ) : null}
      {(() => {
        // A case-entry node's condition is edited at the top of the panel. The form scrolls it
        // with the fields (headerSlot); raw/read-only render it above.
        const conditionSection =
          caseTarget && caseObject ? (
            <CaseConditionSection
              caseObject={caseObject}
              error={conditionError}
              onConfigChange={
                readOnly
                  ? undefined
                  : (next) => {
                      conditionDraftRef.current = next;
                    }
              }
              readOnly={readOnly}
            />
          ) : null;
        if (readOnly) {
          return (
            <>
              {conditionSection}
              <ReadOnlyComponent component={component} />
            </>
          );
        }
        if (useForm && spec) {
          return (
            <NodeConfigForm
              childItems={childItems}
              componentName={componentName}
              headerSlot={conditionSection}
              // Re-key on the saved value so external changes (undo/redo, YAML lane) re-init the form.
              key={JSON.stringify(component)}
              onConfigChange={(next) => {
                componentDraftRef.current = next;
              }}
              onCreateResource={onCreateResource}
              onSelectChild={onSelectChild}
              requireLabel={target.kind === 'resource'}
              resourceLabels={resourceLabels}
              spec={spec}
              value={component}
            />
          );
        }
        // A fan-out container with no schema form (fallback / broker / output switch): show its
        // members as a clickable list rather than raw YAML, so the branching reads as nodes.
        if (childItems && childItems.length > 0 && onSelectChild) {
          const listLabel = componentName === 'switch' || componentName === 'group_by' ? 'Cases' : 'Outputs';
          return (
            <>
              {conditionSection}
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <ChildItemsList items={childItems} label={listLabel} onSelect={onSelectChild} />
              </div>
            </>
          );
        }
        return (
          <>
            {conditionSection}
            <RawComponentEditor
              component={component}
              key={JSON.stringify(component)}
              onConfigChange={(next) => {
                componentDraftRef.current = next;
              }}
            />
          </>
        );
      })()}
    </div>
  );
}

// Secondary node actions (View in YAML, Delete) in a 3-dot menu, keeping the
// destructive Delete out of the way of the header's primary controls.
const InspectorActionsMenu = ({ onOpenInYaml, onDelete }: { onOpenInYaml?: () => void; onDelete?: () => void }) => {
  if (!(onOpenInYaml || onDelete)) {
    return null;
  }
  return (
    <DropdownMenu>
      {/* Base UI uses `render` (not Radix `asChild`) so the trigger IS our icon-sm Button — aligned with its neighbours, not nested. */}
      <DropdownMenuTrigger
        render={<Button aria-label="More actions" className="text-muted-foreground" size="icon-sm" variant="ghost" />}
      >
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onOpenInYaml ? (
          <DropdownMenuItem onClick={onOpenInYaml}>
            <FileCode2 className="size-4" />
            View in YAML
          </DropdownMenuItem>
        ) : null}
        {onOpenInYaml && onDelete ? <DropdownMenuSeparator /> : null}
        {onDelete ? (
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Lint problems for the selected node, shown in context above its config.
const InspectorLintErrors = ({ hints }: { hints: LintHint[] }) => (
  <div className="shrink-0 border-destructive/30 border-b bg-destructive/5 px-4 py-3">
    <div className="mb-1 flex items-center gap-1.5 text-destructive">
      <AlertCircle className="size-4 shrink-0" />
      <Text as="span" className="text-destructive" variant="bodyStrongMedium">
        {hints.length === 1 ? '1 problem' : `${hints.length} problems`}
      </Text>
    </div>
    <ul className="flex flex-col gap-1">
      {hints.map((hint, i) => (
        <li className="text-destructive text-xs" key={`${hint.line}-${hint.column}-${i}`}>
          {hint.hint}
          {hint.line > 0 ? <span className="text-destructive/70"> (line {hint.line})</span> : null}
        </li>
      ))}
    </ul>
  </div>
);

// Write a component-config draft at `target`, cascading a resource-label rename to every component
// that references it (so the link is never silently broken).
function applyComponentDraft(
  yaml: string,
  target: EditTarget,
  config: Record<string, unknown>,
  originalLabel?: string
): string | null {
  const applied = setComponentAt(yaml, target, config);
  if (applied === null) {
    // Surgical editor couldn't rewrite this YAML (e.g. an anchor referenced elsewhere). Return null
    // so the caller keeps the draft (next flush retries) instead of consuming an edit that never landed.
    toast.error('Couldn’t apply this edit to the YAML — edit the component in the YAML view instead.');
    return null;
  }
  if (target.kind === 'resource' && originalLabel) {
    const nextLabel = typeof config.label === 'string' ? config.label : undefined;
    if (nextLabel && nextLabel !== originalLabel) {
      // Kind-scoped: renaming a cache must not rewrite a same-labelled rate limit's references.
      return renameResourceReferences(applied, originalLabel, nextLabel, resourceTargetKind(target)) ?? applied;
    }
  }
  return applied;
}

// Apply a routing-condition `check` to a switch case, preserving key order: a non-empty check is
// set in place, an empty one omitted (the default/else case).
function caseWithCheck(caseObject: Record<string, unknown>, check: string): Record<string, unknown> {
  const trimmed = check.trim();
  const next: Record<string, unknown> = {};
  let placed = false;
  for (const [key, value] of Object.entries(caseObject)) {
    if (key === 'check') {
      placed = true;
      if (trimmed !== '') {
        next.check = trimmed;
      }
    } else {
      next[key] = value;
    }
  }
  if (trimmed !== '' && !placed) {
    next.check = trimmed;
  }
  return next;
}

// Shared draft state for a case's `check` field: tracks the value, re-syncs on saved-case change,
// and reports the edited case up as a draft (null when clean).
function useCaseCheckDraft(
  caseObject: Record<string, unknown>,
  onConfigChange?: (next: Record<string, unknown> | null) => void
) {
  const initial = typeof caseObject.check === 'string' ? caseObject.check : '';
  const [check, setCheck] = useState(initial);
  useEffect(() => setCheck(initial), [initial]);
  const dirty = check !== initial;
  useEffect(() => {
    onConfigChange?.(dirty ? caseWithCheck(caseObject, check) : null);
  }, [check, dirty, caseObject, onConfigChange]);
  return { check, setCheck, dirty };
}

// Edits a switch case's routing condition (`check`); empty makes it the default/else case. The
// case's body is separate canvas nodes — this rail only owns the condition.
const SwitchCaseEditor = ({
  caseObject,
  onConfigChange,
  onDelete,
  onOpenInYaml,
  onClose,
  readOnly,
}: {
  caseObject: Record<string, unknown>;
  onConfigChange?: (next: Record<string, unknown> | null) => void;
  onDelete?: () => void;
  onOpenInYaml?: () => void;
  onClose?: () => void;
  readOnly?: boolean;
}) => {
  const { check, setCheck } = useCaseCheckDraft(caseObject, onConfigChange);
  const inputId = useId();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-border border-b px-4 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning">
          <Split className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <Text as="span" className="text-muted-foreground uppercase tracking-wide" variant="captionStrongMedium">
            Switch
          </Text>
          <Text as="span" className="font-semibold" variant="bodyStrongMedium">
            Routing condition
          </Text>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <InspectorActionsMenu onDelete={onDelete} onOpenInYaml={onOpenInYaml} />
          {onClose ? (
            <Button
              aria-label="Close"
              className="text-muted-foreground"
              onClick={onClose}
              size="icon-sm"
              variant="ghost"
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-4">
        <Label className="font-medium text-sm" htmlFor={inputId}>
          Condition (check)
        </Label>
        <Input
          className="font-mono"
          disabled={readOnly}
          id={inputId}
          onChange={(e) => setCheck(e.target.value)}
          placeholder='e.g. this.region == "us"'
          value={check}
        />
        <Text className="text-muted-foreground" variant="bodySmall">
          A Bloblang expression. Messages route to this case when it's true. Leave empty for the default (else) case.
        </Text>
      </div>
    </div>
  );
};

// The routing condition of a case-entry node, edited inline at the top of its inspector panel.
// Writes the case's `check` (empty = default/else); reported as a draft, auto-committed with the node.
const CaseConditionSection = ({
  caseObject,
  onConfigChange,
  readOnly,
  error,
}: {
  caseObject: Record<string, unknown>;
  onConfigChange?: (next: Record<string, unknown> | null) => void;
  readOnly?: boolean;
  /** A lint message on this condition — renders the input in its error state. */
  error?: string;
}) => {
  const { check, setCheck, dirty } = useCaseCheckDraft(caseObject, onConfigChange);
  const inputId = useId();
  return (
    <div className="border-warning/30 border-b bg-warning/5 px-4 py-3">
      <div className="flex items-center gap-1.5 pb-2">
        <Split className="size-3.5 shrink-0 text-warning" />
        <Label
          className="font-semibold text-[11px] text-warning uppercase leading-none tracking-wide"
          htmlFor={inputId}
        >
          Routing condition
        </Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label="About routing conditions"
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-warning/50 transition-colors hover:text-warning"
                  type="button"
                />
              }
            >
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              A Bloblang expression evaluated per message — this branch runs when it's true. Leave it empty to make this
              the default (else) case.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Input
        aria-invalid={error ? true : undefined}
        className="w-full font-mono"
        disabled={readOnly}
        id={inputId}
        onChange={(e) => setCheck(e.target.value)}
        placeholder='e.g. this.region == "us"'
        value={check}
      />
      {/* The field's own error, shown where it's fixed. Hidden once editing starts — they're addressing it. */}
      {error && !dirty ? (
        <Text className="flex items-center gap-1 pt-1.5 text-destructive" variant="bodySmall">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </Text>
      ) : null}
    </div>
  );
};

// A dangling `resource:` reference (label has no matching resource), with a one-click fix to
// create it under that label.
const DanglingRefBanner = ({ refLabel, onCreate }: { refLabel: string; onCreate: () => void }) => (
  <div className="flex shrink-0 items-center gap-2 border-warning/30 border-b bg-warning-subtle px-4 py-3">
    <AlertCircle className="size-4 shrink-0 text-warning" />
    <Text as="span" className="min-w-0 flex-1 text-warning" variant="bodySmall">
      Resource <span className="font-mono">{refLabel}</span> doesn't exist.
    </Text>
    <Button onClick={onCreate} size="sm" variant="outline">
      Create it
    </Button>
  </div>
);

const EmptyHint = ({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) => (
  <li className="flex items-center gap-2.5">
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-3.5" />
    </span>
    <Text as="span" className="text-muted-foreground" variant="bodySmall">
      {children}
    </Text>
  </li>
);

const InspectorEmptyState = ({ readOnly }: { readOnly?: boolean }) => (
  <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
    <div className="flex size-14 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
      <MousePointerSquareDashed className="size-7" />
    </div>
    <div className="flex max-w-[16rem] flex-col gap-1">
      <Text variant="bodyStrongMedium">No node selected</Text>
      <Text className="text-muted-foreground" variant="bodySmall">
        {readOnly
          ? 'Select a node on the canvas to inspect its configuration.'
          : 'Select a node on the canvas to view and edit its configuration.'}
      </Text>
    </div>
    <ul className="flex flex-col gap-2.5 text-left">
      <EmptyHint icon={MousePointerClick}>Click any node to {readOnly ? 'inspect' : 'edit'} it</EmptyHint>
      {readOnly ? null : <EmptyHint icon={Plus}>Use the + on a connector line to insert a step</EmptyHint>}
    </ul>
  </div>
);

const InspectorHeader = ({
  kindLabel,
  componentName,
  docsUrl,
  onClose,
  onOpenInYaml,
  onDelete,
  usedByCount,
}: {
  kindLabel: string;
  componentName: string;
  docsUrl?: string;
  onClose?: () => void;
  onOpenInYaml?: () => void;
  onDelete?: () => void;
  usedByCount?: number;
}) => (
  <div className="flex shrink-0 items-center gap-3 border-border border-b px-4 py-3">
    <ConnectorLogo className="size-6 shrink-0" fallback={Box} name={componentName as ComponentName} />
    <div className="flex min-w-0 flex-col">
      <Text as="span" className="text-muted-foreground uppercase tracking-wide" variant="captionStrongMedium">
        {kindLabel}
        {typeof usedByCount === 'number' ? ` · used by ${usedByCount} ${usedByCount === 1 ? 'node' : 'nodes'}` : ''}
      </Text>
      <Text as="span" className="min-w-0 truncate font-semibold" title={componentName} variant="bodyStrongMedium">
        {componentName}
      </Text>
    </div>
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {docsUrl ? (
        <Button
          aria-label={`${componentName} documentation`}
          as="a"
          className="text-muted-foreground"
          href={docsUrl}
          rel="noopener noreferrer"
          size="icon-sm"
          target="_blank"
          variant="ghost"
        >
          <BookOpenIcon />
        </Button>
      ) : null}
      <InspectorActionsMenu onDelete={onDelete} onOpenInYaml={onOpenInYaml} />
      {onClose ? (
        <Button aria-label="Close" className="text-muted-foreground" onClick={onClose} size="icon-sm" variant="ghost">
          <X />
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
  onConfigChange,
}: {
  component: Record<string, unknown>;
  onConfigChange?: (next: Record<string, unknown> | null) => void;
}) => {
  const initial = useMemo(() => yamlStringify(component), [component]);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  // Parse the draft live: a valid mapping is reported as pending config; a clean draft or parse
  // error reports nothing, so invalid YAML is never committed.
  useEffect(() => {
    if (draft === initial) {
      setError(null);
      onConfigChange?.(null);
      return;
    }
    let parsed: unknown;
    try {
      parsed = parseYaml(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid YAML');
      onConfigChange?.(null);
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Configuration must be a YAML mapping.');
      onConfigChange?.(null);
      return;
    }
    setError(null);
    onConfigChange?.(parsed as Record<string, unknown>);
  }, [draft, initial, onConfigChange]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Flex column so the editor shrinks to leave room for the error row below it. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
          <YamlEditor
            onChange={(v) => setDraft(v || '')}
            options={{ minimap: { enabled: false } }}
            transparentBackground
            value={draft}
          />
        </div>
        {error ? (
          <Text className="shrink-0 text-destructive" variant="bodySmall">
            {error}
          </Text>
        ) : null}
      </div>
    </div>
  );
};
