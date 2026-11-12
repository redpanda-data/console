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
import { type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { isNode, LineCounter, parseDocument } from 'yaml';

import { type FieldLintErrors, mapLintHintsToFields } from './lint-field-mapping';
import { ChildItemsList, formFieldKeys, type InspectorChildItem, NodeConfigForm } from './node-config-form';
// Which node the inspector shows: its canvas id, which a stop condition wrapping it or its broker doesn't
// change, else its path.
import {
  applyComponentDraft,
  CaseConditionSection,
  DanglingRefBanner,
  DeprecatedComponentBanner,
  InspectorEmptyState,
  InspectorHeader,
  InspectorLintErrors,
  RawComponentEditor,
  ReadOnlyComponent,
  SwitchCaseEditor,
} from './node-inspector-editors';
import { StopConditionSection } from './stop-condition';
import { isObject, isPresent } from '../../../../utils/type-guards';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { getConnectorDocsUrl } from '../utils/connector-docs';
import type { InputEndBehavior } from '../utils/input-end-behavior';
import type { StopSlot } from '../utils/pipeline-flow-nodes';
import type { StopConditionDraft } from '../utils/read-until';
import { findConnectComponent } from '../utils/schema';
import { buildInsertableComponent } from '../utils/yaml';
import { appendResource, getComponentAt, setComponentAt } from '../utils/yaml-component-editing';
import { componentKeyAt, type EditTarget, editTargetPath, targetComponentType } from '../utils/yaml-edit-target';
import {
  countResourceReferences,
  listResourceLabels,
  type ResourceKind,
  resourceArrayKey,
  resourceKindForComponentName,
  resourceRefKindForTarget,
} from '../utils/yaml-resources';

const nodeIdentity = (target: EditTarget, nodeId?: string): string => nodeId ?? JSON.stringify(editTargetPath(target));

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
  /** The selected canvas node's id. */
  nodeId?: string;
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
  /** Warnings for deprecated components in the selected node's config. */
  deprecations?: string[];
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
  /** An input's stop condition (`read_until`), shown under the header. */
  stop?: { slot: StopSlot; effective: InputEndBehavior; isGroup?: boolean };
  /** Set or clear that stop condition; absent in read-only mode. */
  onSetStopCondition?: (draft: StopConditionDraft | null) => boolean;
};

/** The inspector's pending-edit hooks, registered into the panel's `commitRef`. */
export type PendingNodeCommit = {
  /** Apply the node's pending edits into `yaml` and consume them (idempotent once consumed). */
  commit: (yaml: string) => string;
  /** Drop the pending edits without applying (delete / undo / redo). */
  discard: () => void;
};

// The top-level section a target's component is.
const topLevelSection = (target: EditTarget | null): 'input' | 'output' | undefined =>
  target?.kind === 'input' || target?.kind === 'output' ? target.kind : undefined;

// Lint message falling on a switch case's routing `check` line, so the condition field can show its own error.
function lintMessageOnCaseCheck(yaml: string, caseTarget: EditTarget, lintHints?: LintHint[]): string | undefined {
  if (!(isPresent(lintHints) && lintHints.length > 0)) {
    return;
  }
  try {
    const lineCounter = new LineCounter();
    const doc = parseDocument(yaml, { lineCounter });
    const checkNode = doc.getIn([...editTargetPath(caseTarget), 'check'], true);
    if (!(isNode(checkNode) && checkNode.range)) {
      return;
    }
    const { line } = lineCounter.linePos(checkNode.range[0]);
    return lintHints.find((h) => h.line === line)?.hint;
  } catch {
    // Unparseable YAML: no hint, as for a case without a check.
  }
}

type InspectorDraftsArgs = Pick<
  NodeInspectorProps,
  'target' | 'nodeId' | 'caseTarget' | 'commitRef' | 'onRequestCommit'
> & {
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

// Clear pending drafts when the selected node changes — the inspector instance is reused.
function useClearDraftsOnNodeChange(
  { target, nodeId, caseTarget }: Pick<InspectorDraftsArgs, 'target' | 'nodeId' | 'caseTarget'>,
  draftRefs: DraftRef[]
) {
  const targetIdentity = target ? nodeIdentity(target, nodeId) : '';
  const caseIdentity = caseTarget ? JSON.stringify(editTargetPath(caseTarget)) : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: the identities are change triggers; the body only resets refs.
  useEffect(() => {
    for (const draftRef of draftRefs) {
      draftRef.current = null;
    }
  }, [targetIdentity, caseIdentity]);
}

// Pending edits from the active editors (null when clean), registered into the panel's `commitRef`
// so it can flush them on node-leave / save, and flushed per field through `commitField`.
function useInspectorDrafts({
  target,
  nodeId,
  caseTarget,
  component,
  commitRef,
  onRequestCommit,
}: InspectorDraftsArgs) {
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
  useClearDraftsOnNodeChange({ target, nodeId, caseTarget }, [componentDraftRef, conditionDraftRef]);

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
  const componentName = component && target ? componentKeyAt(target, component) : undefined;

  if (!(target && component && componentName !== null && componentName !== undefined && componentName !== '')) {
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
        onDelete={readOnly === true || !onDelete ? undefined : () => onDelete(target)}
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
  const rendersFieldAnchors =
    !(readOnly === true) &&
    isPresent(spec?.config?.children) &&
    spec?.config?.children.length > 0 &&
    !Array.isArray(componentValue);
  const fieldKeys = useMemo(
    () => (rendersFieldAnchors && spec !== undefined ? formFieldKeys(spec) : new Set<string>()),
    [rendersFieldAnchors, spec]
  );
  return useMemo(() => {
    if (!(isPresent(lintHints) && lintHints.length > 0)) {
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
  section: 'input' | 'output' | undefined,
  readOnly?: boolean,
  onAddTopic?: (section: string, componentName: string) => void
): (() => void) | undefined {
  if (readOnly === true || !(onAddTopic && section)) {
    return;
  }
  return () => onAddTopic(section, componentName);
}

// A `resource:` reference whose label has no matching resource — fixable here vs. failing at deploy.
function findDanglingResourceRef(
  component: Record<string, unknown>,
  componentName: string,
  resourceLabels: Record<ResourceKind, string[]>
): { ref: string; kind: ResourceKind } | undefined {
  const refKind = resourceKindForComponentName(componentName);
  const innerConfig = component[componentName];
  const refValue = isObject(innerConfig) && !Array.isArray(innerConfig) ? innerConfig.resource : undefined;
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
      usedByCount={
        resourceLabel !== null && resourceLabel !== undefined && resourceLabel !== ''
          ? countResourceReferences(yaml, resourceLabel, resourceRefKind)
          : undefined
      }
    />
  );
};

type ComponentInspectorProps = NodeInspectorProps & {
  target: EditTarget;
  component: Record<string, unknown>;
  componentName: string;
  drafts: InspectorDrafts;
};

function inspectorConditionSection(
  caseTarget: EditTarget | null | undefined,
  caseObject: Record<string, unknown> | null | undefined,
  conditionError: string | undefined,
  readOnly: boolean | undefined,
  onDraft: InspectorDrafts['reportConditionDraft']
): ReactNode {
  if (!(caseTarget && caseObject)) {
    return null;
  }
  return (
    <CaseConditionSection
      caseObject={caseObject}
      error={conditionError}
      key={JSON.stringify(editTargetPath(caseTarget))}
      onConfigChange={readOnly === true ? undefined : onDraft}
      readOnly={readOnly}
    />
  );
}

// A component node: header, the problems that didn't anchor to a field, and its editor.
function ComponentInspector(props: ComponentInspectorProps) {
  const { target, caseTarget, yaml, components, component, componentName, readOnly, onDelete, drafts, stop } = props;
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

  const conditionSection = inspectorConditionSection(
    caseTarget,
    caseObject,
    conditionError,
    readOnly,
    drafts.reportConditionDraft
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ComponentInspectorHeader
        component={component}
        componentName={componentName}
        onClose={props.onClose}
        // Delete lives in the header's 3-dot menu.
        onDelete={readOnly === true || !onDelete ? undefined : () => onDelete(target)}
        onOpenInYaml={props.onOpenInYaml}
        target={target}
        yaml={yaml}
      />
      {/* Field-anchored problems render under their fields; the banner keeps only what didn't map. */}
      {lintMapping.unmapped.length > 0 ? <InspectorLintErrors hints={lintMapping.unmapped} /> : null}
      {danglingRef && !(readOnly === true) ? (
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
      {isPresent(props.deprecations) && props.deprecations.length > 0 ? (
        <DeprecatedComponentBanner messages={props.deprecations} />
      ) : null}
      {stop ? (
        <StopConditionSection
          effective={stop.effective}
          isGroup={stop.isGroup}
          name={componentName}
          onApply={readOnly === true ? undefined : props.onSetStopCondition}
          slot={stop.slot}
        />
      ) : null}
      <InspectorBody
        childItems={props.childItems}
        component={component}
        componentName={componentName}
        conditionSection={conditionSection}
        fieldErrors={lintMapping.byField}
        identity={nodeIdentity(target, props.nodeId)}
        onCommitField={readOnly === true || !props.onRequestCommit ? undefined : drafts.commitField}
        onCreateResource={props.onCreateResource}
        onCreateTopic={createTopicHandler(componentName, topLevelSection(target), readOnly, props.onAddTopic)}
        onSelectChild={props.onSelectChild}
        readOnly={readOnly}
        reportComponentDraft={drafts.reportComponentDraft}
        resetToken={props.resetToken}
        resourceLabels={resourceLabels}
        spec={spec}
        target={target}
        useForm={isPresent(spec?.config?.children) && spec?.config?.children.length > 0}
      />
    </div>
  );
}

type InspectorBodyProps = {
  conditionSection: ReactNode;
  /** Re-keys the editors on selection change. */
  identity: string;
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
  identity,
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
  if (readOnly === true) {
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
        key={`${identity}:${resetToken ?? 0}`}
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
        // Same keying as NodeConfigForm: remount on node identity or undo/redo, re-sync in place otherwise.
        key={`${identity}:${resetToken ?? 0}`}
        onCommitField={onCommitField}
        onConfigChange={reportComponentDraft}
      />
    </>
  );
};
