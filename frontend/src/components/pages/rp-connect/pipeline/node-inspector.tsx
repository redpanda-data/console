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
import { ElementTooltip } from 'components/misc/element-tooltip';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
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
import { type ReactNode, type RefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { pluralizeWithNumber } from 'utils/string';
import { LineCounter, parseDocument, parse as parseYaml, stringify as yamlStringify } from 'yaml';

import { type FieldLintErrors, mapLintHintsToFields, type UnmappedLintHint } from './lint-field-mapping';
import { ChildItemsList, formFieldKeys, type InspectorChildItem, NodeConfigForm } from './node-config-form';
import { ConnectorLogo } from '../onboarding/connector-logo';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { getConnectorDocsUrl } from '../utils/connector-docs';
import { findConnectComponent } from '../utils/schema';
import {
  appendResource,
  buildInsertableComponent,
  countResourceReferences,
  type EditTarget,
  editTargetPath,
  firstKey,
  getComponentAt,
  listResourceLabels,
  type ResourceKind,
  renameResourceReferences,
  resourceArrayKey,
  resourceKindForComponentName,
  resourceRefKindForTarget,
  setComponentAt,
  targetComponentType,
} from '../utils/yaml';

// Default component per kind for the dangling-reference quick-fix.
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

type NodeInspectorProps = {
  target: EditTarget | null;
  /** For a switch-case entry node: the case's routing-condition target, shown at the top of the panel. */
  caseTarget?: EditTarget | null;
  /** Canonical pipeline YAML — read from and written back to. */
  yaml: string;
  /** Specs that drive the schema form. */
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
  commitRef?: RefObject<PendingNodeCommit | null>;
  /** Flush pending edits into the YAML immediately (field-blur / Apply commits, not just node-leave). */
  onRequestCommit?: () => void;
  /** Bumped on undo/redo so the form remounts (drops now-stale edit state) instead of resyncing in place. */
  resetToken?: number;
  /** Opens the Add-topic dialog for a top-level input/output; the result is patched into its YAML. */
  onAddTopic?: (section: string, componentName: string) => void;
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
    const { line } = lineCounter.linePos(checkNode.range[0]);
    return lintHints.find((h) => h.line === line)?.hint;
  } catch {
    // Unparseable YAML: no hint, as for a case without a check.
  }
}

type InspectorDraftsArgs = Pick<NodeInspectorProps, 'target' | 'caseTarget' | 'commitRef' | 'onRequestCommit'> & {
  component?: Record<string, unknown>;
};

type DraftRef = RefObject<Record<string, unknown> | null>;

// Writes the pending routing-condition draft at `caseTarget`, consuming it once it lands.
function flushConditionDraft(draftRef: DraftRef, yaml: string, caseTarget?: EditTarget | null): string {
  const cond = draftRef.current;
  if (!(cond && caseTarget)) {
    return yaml;
  }
  const applied = setComponentAt(yaml, caseTarget, cond);
  if (applied === null) {
    // Surgical editor couldn't rewrite this YAML; keep the draft (next flush retries) and warn.
    toast.error('Couldn’t apply the condition edit to the YAML — edit it in the YAML view instead.');
    return yaml;
  }
  draftRef.current = null;
  return applied;
}

// Writes the pending component draft at `target`, consuming it once it lands.
function flushComponentDraft(
  draftRef: DraftRef,
  yaml: string,
  target: EditTarget | null,
  originalLabel?: string
): string {
  const comp = draftRef.current;
  if (!(comp && target)) {
    return yaml;
  }
  const applied = applyComponentDraft(yaml, target, comp, originalLabel);
  if (applied === null) {
    return yaml;
  }
  draftRef.current = null;
  return applied;
}

// Pending edits from the active editors (null when clean), registered into the panel's `commitRef`
// so it can flush them on node-leave / save, and flushed per field through `commitField`.
function useInspectorDrafts({ target, caseTarget, component, commitRef, onRequestCommit }: InspectorDraftsArgs) {
  // Refs, not state, so per-keystroke reporting doesn't re-render. `component` applies at
  // `target`; `condition` at `caseTarget`.
  const componentDraftRef = useRef<Record<string, unknown> | null>(null);
  const conditionDraftRef = useRef<Record<string, unknown> | null>(null);
  // Stable draft reporters — they sit in the editors' effect deps, so an inline arrow would re-fire it every render.
  const reportComponentDraft = useCallback((next: Record<string, unknown> | null) => {
    componentDraftRef.current = next;
  }, []);
  const reportConditionDraft = useCallback((next: Record<string, unknown> | null) => {
    conditionDraftRef.current = next;
  }, []);
  // The resource's original label, captured for the rename cascade when committing a resource
  // edit — for cache/rate_limit `resource` targets and `*_resources` items alike.
  const resourceLabel0 =
    target && resourceRefKindForTarget(target) && component && typeof component.label === 'string'
      ? component.label
      : undefined;

  // Commit pending edits, condition before component — the condition replaces the whole case, so
  // written second it would clobber the component edit. Drafts are consumed as applied (re-call = no-op).
  const commit = useCallback(
    (input: string): string => {
      const withCondition = flushConditionDraft(conditionDraftRef, input, caseTarget);
      return flushComponentDraft(componentDraftRef, withCondition, target, resourceLabel0);
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

  // Flush the draft immediately (field blur / Apply); reports whether the write landed — the
  // panel's flush consumes the draft on success, so a surviving draft means it failed.
  const commitField = useCallback((): boolean => {
    if (!onRequestCommit) {
      return false;
    }
    onRequestCommit();
    return componentDraftRef.current === null;
  }, [onRequestCommit]);

  return { reportComponentDraft, reportConditionDraft, commitField };
}

type InspectorDrafts = ReturnType<typeof useInspectorDrafts>;

/**
 * The always-present right rail: the selected node's identity plus either a schema-driven form
 * or scoped YAML (read-only / unknown schema). Edits write back into the pipeline YAML at `target`.
 */
export function NodeInspector(props: NodeInspectorProps) {
  const { target, yaml, readOnly, onDelete, onClose, onOpenInYaml } = props;
  const component = useMemo(() => (target ? getComponentAt(yaml, target) : undefined), [yaml, target]);
  const drafts = useInspectorDrafts({ ...props, component });
  const componentName = component ? firstKey(component) : undefined;

  if (!(target && component && componentName)) {
    return <InspectorEmptyState readOnly={readOnly} />;
  }

  // A switch case is edited for its routing condition only; its body is separate nodes. Reported
  // as a draft (at `target`), auto-committed on leave / save.
  if (target.kind === 'switchCase') {
    return (
      // Key by the case's path so switching cases remounts the editor and resets the `check` draft —
      // otherwise a typed value leaks to a sibling with an equal saved check, misrouting on save.
      <SwitchCaseEditor
        caseObject={component}
        key={JSON.stringify(editTargetPath(target))}
        onClose={onClose}
        onConfigChange={drafts.reportComponentDraft}
        onDelete={readOnly || !onDelete ? undefined : () => onDelete(target)}
        onOpenInYaml={onOpenInYaml}
        readOnly={readOnly}
      />
    );
  }

  return (
    <ComponentInspector
      {...props}
      component={component}
      componentName={componentName}
      drafts={drafts}
      target={target}
    />
  );
}

// Anchor the node's lint hints to the form fields they're about; the banner keeps only the rest.
// Anchors exist only when the schema form will actually render them: in read-only mode, for the
// raw-YAML/member-list fallbacks, and for list-valued components (switch/try — value is an array,
// so the form shows no schema fields) everything stays bannered, located by field name via lines.
function useNodeLintMapping({
  yaml,
  target,
  component,
  componentName,
  spec,
  readOnly,
  lintHints,
}: Pick<ComponentInspectorProps, 'yaml' | 'target' | 'component' | 'componentName' | 'readOnly' | 'lintHints'> & {
  spec?: ConnectComponentSpec;
}) {
  const componentValue = component[componentName];
  const rendersFieldAnchors = !readOnly && (spec?.config?.children?.length ?? 0) > 0 && !Array.isArray(componentValue);
  const fieldKeys = useMemo(
    () => (rendersFieldAnchors && spec ? formFieldKeys(spec) : new Set<string>()),
    [rendersFieldAnchors, spec]
  );
  return useMemo(() => {
    if (!lintHints?.length) {
      const byField: FieldLintErrors = new Map();
      return { byField, unmapped: (lintHints ?? []).map((hint) => ({ hint })) };
    }
    return mapLintHintsToFields({ yaml, target, componentName, hints: lintHints, fieldKeys });
  }, [yaml, target, componentName, lintHints, fieldKeys]);
}

// The routing condition of the switch case a case-entry node sits in, with any lint problem on its
// `check` line so the field shows its own error, not just the banner.
function useCaseCondition(yaml: string, caseTarget?: EditTarget | null, lintHints?: LintHint[]) {
  const caseObject = useMemo(() => (caseTarget ? getComponentAt(yaml, caseTarget) : undefined), [yaml, caseTarget]);
  const conditionError = useMemo(
    () => (caseTarget ? lintMessageOnCaseCheck(yaml, caseTarget, lintHints) : undefined),
    [yaml, caseTarget, lintHints]
  );
  return { caseObject, conditionError };
}

// Create-topic is patched by section+componentName, which only resolves for top-level
// input/output nodes; nested topic fields still get the picker, just not the create flow.
function createTopicHandler(
  componentName: string,
  targetKind: EditTarget['kind'],
  readOnly?: boolean,
  onAddTopic?: (section: string, componentName: string) => void
): (() => void) | undefined {
  if (readOnly || !onAddTopic || !(targetKind === 'input' || targetKind === 'output')) {
    return;
  }
  return () => onAddTopic(targetKind, componentName);
}

// A `resource:` reference whose label has no matching resource — fixable here vs. failing at deploy.
function findDanglingResourceRef(
  component: Record<string, unknown>,
  componentName: string,
  resourceLabels: Record<ResourceKind, string[]>
): { ref: string; kind: ResourceKind } | undefined {
  const refKind = resourceKindForComponentName(componentName);
  const innerConfig = component[componentName];
  const refValue =
    innerConfig && typeof innerConfig === 'object' && !Array.isArray(innerConfig)
      ? (innerConfig as Record<string, unknown>).resource
      : undefined;
  return refKind && typeof refValue === 'string' && refValue !== '' && !resourceLabels[refKind].includes(refValue)
    ? { ref: refValue, kind: refKind }
    : undefined;
}

// Quick-fix: the YAML with the missing resource created under that exact label, so the reference
// resolves; undefined when no default component of that kind is available.
function yamlWithMissingResource(
  yaml: string,
  danglingRef: { ref: string; kind: ResourceKind },
  components: ConnectComponentSpec[]
): string | undefined {
  const obj = buildInsertableComponent(DEFAULT_RESOURCE_COMPONENT[danglingRef.kind], danglingRef.kind, components);
  if (!obj) {
    return;
  }
  obj.label = danglingRef.ref;
  return appendResource(yaml, resourceArrayKey(danglingRef.kind), obj) ?? yaml;
}

// Header for a component node: kind, name, and — for a resource — how many nodes reference it.
const ComponentInspectorHeader = ({
  target,
  component,
  componentName,
  yaml,
  onClose,
  onDelete,
  onOpenInYaml,
}: Pick<ComponentInspectorProps, 'target' | 'component' | 'componentName' | 'yaml' | 'onClose' | 'onOpenInYaml'> & {
  onDelete?: () => void;
}) => {
  const kind = targetComponentType(target);
  // Resource label + reference count ("Used by N"). Kind-scoped: a same-labelled resource of
  // another kind must not inflate the count.
  const resourceRefKind = resourceRefKindForTarget(target);
  const resourceLabel = resourceRefKind && typeof component.label === 'string' ? component.label : undefined;
  return (
    <InspectorHeader
      componentName={componentName}
      docsUrl={getConnectorDocsUrl(kind, componentName)}
      kindLabel={COMPONENT_TYPE_LABEL[kind] ?? 'Component'}
      onClose={onClose}
      onDelete={onDelete}
      onOpenInYaml={onOpenInYaml}
      usedByCount={resourceLabel ? countResourceReferences(yaml, resourceLabel, resourceRefKind) : undefined}
    />
  );
};

type ComponentInspectorProps = NodeInspectorProps & {
  target: EditTarget;
  component: Record<string, unknown>;
  componentName: string;
  drafts: InspectorDrafts;
};

// A component node: header, the problems that didn't anchor to a field, and its editor.
function ComponentInspector(props: ComponentInspectorProps) {
  const { target, caseTarget, yaml, components, component, componentName, readOnly, onDelete, drafts } = props;
  const spec = useMemo(
    () => findConnectComponent(components, componentName, targetComponentType(target)),
    [components, target, componentName]
  );
  const lintMapping = useNodeLintMapping({ ...props, spec });
  const { caseObject, conditionError } = useCaseCondition(yaml, caseTarget, props.lintHints);
  // Resource labels for the `resource:` dropdowns in this component's form.
  const resourceLabels: Record<ResourceKind, string[]> = {
    cache: listResourceLabels(yaml, 'cache'),
    rate_limit: listResourceLabels(yaml, 'rate_limit'),
  };
  const danglingRef = findDanglingResourceRef(component, componentName, resourceLabels);

  // A case-entry node's condition is edited at the top of the panel. The form scrolls it with the
  // fields (headerSlot); raw/read-only render it above.
  const conditionSection =
    caseTarget && caseObject ? (
      // Key by the case's path so selecting a sibling remounts + resets the draft (see above).
      <CaseConditionSection
        caseObject={caseObject}
        error={conditionError}
        key={JSON.stringify(editTargetPath(caseTarget))}
        onConfigChange={readOnly ? undefined : drafts.reportConditionDraft}
        readOnly={readOnly}
      />
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ComponentInspectorHeader
        component={component}
        componentName={componentName}
        onClose={props.onClose}
        // Delete lives in the header's 3-dot menu.
        onDelete={readOnly || !onDelete ? undefined : () => onDelete(target)}
        onOpenInYaml={props.onOpenInYaml}
        target={target}
        yaml={yaml}
      />
      {/* Field-anchored problems render under their fields; the banner keeps only what didn't map. */}
      {lintMapping.unmapped.length > 0 ? <InspectorLintErrors hints={lintMapping.unmapped} /> : null}
      {danglingRef && !readOnly ? (
        <DanglingRefBanner
          onCreate={() => {
            const next = yamlWithMissingResource(yaml, danglingRef, components);
            if (next !== undefined) {
              props.onApply(next);
            }
          }}
          refLabel={danglingRef.ref}
        />
      ) : null}
      <InspectorBody
        childItems={props.childItems}
        component={component}
        componentName={componentName}
        conditionSection={conditionSection}
        fieldErrors={lintMapping.byField}
        onCommitField={readOnly || !props.onRequestCommit ? undefined : drafts.commitField}
        onCreateResource={props.onCreateResource}
        onCreateTopic={createTopicHandler(componentName, target.kind, readOnly, props.onAddTopic)}
        onSelectChild={props.onSelectChild}
        readOnly={readOnly}
        reportComponentDraft={drafts.reportComponentDraft}
        resetToken={props.resetToken}
        resourceLabels={resourceLabels}
        spec={spec}
        target={target}
        useForm={(spec?.config?.children?.length ?? 0) > 0}
      />
    </div>
  );
}

type InspectorBodyProps = {
  conditionSection: ReactNode;
  component: Record<string, unknown>;
  componentName: string;
  useForm: boolean;
  spec?: ConnectComponentSpec;
  target: EditTarget;
  readOnly?: boolean;
  childItems?: InspectorChildItem[];
  onSelectChild?: (item: InspectorChildItem) => void;
  onCreateResource?: (kind: ResourceKind) => void;
  resourceLabels: Record<ResourceKind, string[]>;
  reportComponentDraft: (next: Record<string, unknown> | null) => void;
  fieldErrors?: FieldLintErrors;
  onCommitField?: () => boolean;
  onCreateTopic?: () => void;
  resetToken?: number;
};

// Case-condition section (if any) plus the most specific of: schema form, read-only view, child list, raw YAML.
const InspectorBody = ({
  conditionSection,
  component,
  componentName,
  useForm,
  spec,
  target,
  readOnly,
  childItems,
  onSelectChild,
  onCreateResource,
  resourceLabels,
  reportComponentDraft,
  fieldErrors,
  onCommitField,
  onCreateTopic,
  resetToken,
}: InspectorBodyProps) => {
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
        fieldErrors={fieldErrors}
        headerSlot={conditionSection}
        // Re-key on node identity + the undo/redo token: identity remounts on selection change (a
        // sibling with identical config can't inherit dirty state); the token remounts on undo/redo,
        // dropping stale edit state. Same-node saved-value changes (field-blur commits, Topic/User
        // dialogs) re-sync IN PLACE inside the form, so focus and scroll survive a commit.
        key={`${JSON.stringify(editTargetPath(target))}:${resetToken ?? 0}`}
        onCommitField={onCommitField}
        onConfigChange={reportComponentDraft}
        onCreateResource={onCreateResource}
        onCreateTopic={onCreateTopic}
        onSelectChild={onSelectChild}
        requireLabel={resourceRefKindForTarget(target) !== undefined}
        resourceLabels={resourceLabels}
        spec={spec}
        value={component}
      />
    );
  }
  // Fan-out container with no schema form (fallback / broker / output switch): list members instead of raw YAML.
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
        key={`${JSON.stringify(editTargetPath(target))}:${JSON.stringify(component)}`}
        onConfigChange={reportComponentDraft}
      />
    </>
  );
};

// Secondary node actions (View in YAML, Delete) in a 3-dot menu.
const InspectorActionsMenu = ({ onOpenInYaml, onDelete }: { onOpenInYaml?: () => void; onDelete?: () => void }) => {
  if (!(onOpenInYaml || onDelete)) {
    return null;
  }
  return (
    <DropdownMenu>
      {/* Base UI `render` (not Radix `asChild`): the trigger IS our icon-sm Button, not a nested one. */}
      {/* `current-ghost`: the trigger takes the muted ink of the header's action group. */}
      <DropdownMenuTrigger render={<Button aria-label="More actions" size="icon-sm" variant="current-ghost" />}>
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
          <DropdownMenuItem onClick={onDelete} variant="destructive">
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const InspectorBanner = ({
  tone,
  title,
  children,
}: {
  tone: 'destructive' | 'warning';
  title: ReactNode;
  children?: ReactNode;
}) => (
  <Alert className="shrink-0" icon={<AlertCircle />} variant={tone}>
    <AlertTitle>{title}</AlertTitle>
    {children ? <AlertDescription>{children}</AlertDescription> : null}
  </Alert>
);

// Lint problems for the selected node that didn't anchor to a form field, shown above its config.
// No line numbers — there are none to see in this view; when the problem's line resolved to a
// known (unrendered) field, its name is shown instead.
const InspectorLintErrors = ({ hints }: { hints: UnmappedLintHint[] }) => (
  <InspectorBanner title={pluralizeWithNumber(hints.length, 'problem')} tone="destructive">
    <ul className="flex flex-col gap-1">
      {hints.map(({ hint, fieldLabel }, i) => (
        <li className="text-body-sm" key={`${hint.line}-${hint.column}-${i}`}>
          {hint.hint}
          {fieldLabel ? <span className="text-muted-foreground"> ({fieldLabel})</span> : null}
        </li>
      ))}
    </ul>
  </InspectorBanner>
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
  const refKind = resourceRefKindForTarget(target);
  if (refKind && originalLabel) {
    const nextLabel = typeof config.label === 'string' ? config.label : undefined;
    if (nextLabel && nextLabel !== originalLabel) {
      // Kind-scoped: renaming a cache must not rewrite a same-labelled rate limit's (or input's) references.
      return renameResourceReferences(applied, originalLabel, nextLabel, refKind) ?? applied;
    }
  }
  return applied;
}

// Apply a routing-condition `check` to a switch case, preserving key order: a non-empty check is
// set in place, an empty one omitted (the default/else case).
function caseWithCheck(caseObject: Record<string, unknown>, check: string): Record<string, unknown> {
  const trimmed = check.trim();
  const entries = Object.entries(caseObject);
  if (!Object.hasOwn(caseObject, 'check')) {
    entries.push(['check', trimmed]);
  }
  return Object.fromEntries(
    entries
      .map(([key, value]): [string, unknown] => (key === 'check' ? [key, trimmed] : [key, value]))
      .filter(([key]) => key !== 'check' || trimmed !== '')
  );
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

const CASE_CHECK_PLACEHOLDER = 'e.g. this.region == "us"';

// The mono `check` text field shared by the switch-case editor and the inline case-condition section.
const CaseCheckInput = ({
  id,
  check,
  setCheck,
  readOnly,
  invalid,
}: {
  id: string;
  check: string;
  setCheck: (value: string) => void;
  readOnly?: boolean;
  invalid?: boolean;
}) => (
  <Input
    aria-invalid={invalid ? true : undefined}
    className="w-full"
    disabled={readOnly}
    id={id}
    onChange={(e) => setCheck(e.target.value)}
    placeholder={CASE_CHECK_PLACEHOLDER}
    value={check}
  />
);

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
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning">
          <Split className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-body-sm font-medium tracking-wide text-muted-foreground uppercase">Switch</span>
          <span className="text-body font-semibold">Routing condition</span>
        </div>
        {/* Muted actions: the `current-ghost` buttons take this group's ink. */}
        <div className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
          <InspectorActionsMenu onDelete={onDelete} onOpenInYaml={onOpenInYaml} />
          {onClose ? (
            <Button aria-label="Close" onClick={onClose} size="icon-sm" variant="current-ghost">
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-4">
        <Label htmlFor={inputId}>Condition (check)</Label>
        <CaseCheckInput check={check} id={inputId} readOnly={readOnly} setCheck={setCheck} />
        <div className="text-body-sm text-muted-foreground">
          A Bloblang expression. Messages route to this case when it's true. Leave empty for the default (else) case.
        </div>
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
    <div className="border-b border-warning/30 bg-warning/5 px-4 py-3">
      <div className="flex items-center gap-1.5 pb-2">
        <TonedIcon className="size-3.5 shrink-0" icon={Split} tone="warning" />
        <Label htmlFor={inputId}>Routing condition</Label>
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
      <CaseCheckInput check={check} id={inputId} invalid={Boolean(error)} readOnly={readOnly} setCheck={setCheck} />
      {/* The field's own error, shown where it's fixed. Hidden once editing starts — they're addressing it. */}
      {error && !dirty ? (
        <div className="flex items-center gap-1 pt-1.5 text-body-sm text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </div>
      ) : null}
    </div>
  );
};

// Banner for a dangling `resource:` reference, with a one-click fix that creates it under that
// label.
const DanglingRefBanner = ({ refLabel, onCreate }: { refLabel: string; onCreate: () => void }) => (
  <InspectorBanner
    title={
      <>
        Resource <span className="font-mono">{refLabel}</span> doesn't exist.
      </>
    }
    tone="warning"
  >
    <Button onClick={onCreate} size="sm" variant="outline">
      Create it
    </Button>
  </InspectorBanner>
);

const EmptyHint = ({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) => (
  <li className="flex items-center gap-2.5">
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-3.5" />
    </span>
    <span className="text-body-sm text-muted-foreground">{children}</span>
  </li>
);

const InspectorEmptyState = ({ readOnly }: { readOnly?: boolean }) => (
  <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
    <div className="flex size-14 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
      <MousePointerSquareDashed className="size-7" />
    </div>
    <div className="flex max-w-[16rem] flex-col gap-1">
      <div className="text-body font-medium">No node selected</div>
      <div className="text-body-sm text-muted-foreground">
        {readOnly
          ? 'Select a node on the canvas to inspect its configuration.'
          : 'Select a node on the canvas to view and edit its configuration.'}
      </div>
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
  <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
    <ConnectorLogo className="size-6 shrink-0" fallback={Box} name={componentName as ComponentName} />
    <div className="flex min-w-0 flex-col">
      <span className="text-body-sm font-medium tracking-wide text-muted-foreground uppercase">
        {kindLabel}
        {typeof usedByCount === 'number' ? ` · used by ${pluralizeWithNumber(usedByCount, 'node')}` : ''}
      </span>
      <ElementTooltip content={componentName}>
        <span className="min-w-0 truncate text-body font-semibold">{componentName}</span>
      </ElementTooltip>
    </div>
    {/* Muted actions: the `current-ghost` buttons take this group's ink. */}
    <div className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
      {docsUrl ? (
        <Button
          aria-label={`${componentName} documentation`}
          as="a"
          href={docsUrl}
          rel="noopener noreferrer"
          size="icon-sm"
          target="_blank"
          variant="current-ghost"
        >
          <BookOpenIcon />
        </Button>
      ) : null}
      <InspectorActionsMenu onDelete={onDelete} onOpenInYaml={onOpenInYaml} />
      {onClose ? (
        <Button aria-label="Close" onClick={onClose} size="icon-sm" variant="current-ghost">
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

type ComponentDraft = { config: Record<string, unknown> | null; error: string | null };

const CLEAN_COMPONENT_DRAFT: ComponentDraft = { config: null, error: null };

// An edited draft as a component config, or why it can't be one.
function parseComponentDraft(draft: string): ComponentDraft {
  let parsed: unknown;
  try {
    parsed = parseYaml(draft);
  } catch (e) {
    return { config: null, error: e instanceof Error ? e.message : 'Invalid YAML' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: null, error: 'Configuration must be a YAML mapping.' };
  }
  return { config: parsed as Record<string, unknown>, error: null };
}

// Fallback editor for components without a known schema (e.g. bloblang mappings): scoped, editable YAML.
const RawComponentEditor = ({
  component,
  onConfigChange,
}: {
  component: Record<string, unknown>;
  onConfigChange?: (next: Record<string, unknown> | null) => void;
}) => {
  // No prop→state resync: the sole call site keys this editor on the component value, so a
  // changed `component` always remounts a fresh instance (same contract as NodeConfigForm).
  const initial = useMemo(() => yamlStringify(component), [component]);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  // Parse the draft live: a valid mapping is reported as pending config; a clean draft or parse
  // error reports nothing, so invalid YAML is never committed.
  useEffect(() => {
    const result = draft === initial ? CLEAN_COMPONENT_DRAFT : parseComponentDraft(draft);
    setError(result.error);
    onConfigChange?.(result.config);
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
        {error ? <div className="shrink-0 text-body-sm text-destructive">{error}</div> : null}
      </div>
    </div>
  );
};
