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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from 'components/redpanda-ui/components/tooltip';
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
import { useEffect, useMemo, useState } from 'react';
import { LineCounter, parseDocument, parse as parseYaml, stringify as yamlStringify } from 'yaml';

import { type InspectorChildItem, NodeConfigForm, type ResourceKind } from './node-config-form';
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
  setComponentAt,
} from '../utils/yaml';

// The default impl used by the dangling-reference quick-fix (which must keep the exact
// missing label); picking a specific impl goes through the resource picker instead.
const DEFAULT_RESOURCE_COMPONENT: Record<ResourceKind, string> = { cache: 'memory', rate_limit: 'local' };

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
    case 'switchCase':
      // Never used for rendering (the inspector special-cases switchCase first).
      return 'processor';
    default:
      return target.resourceKey === 'cache_resources' ? 'cache' : 'rate_limit';
  }
}

type NodeInspectorProps = {
  /** The selected component, or null when nothing is selected. */
  target: EditTarget | null;
  /** When the selected node is a switch-case ENTRY, the edit target for the case's routing
      condition — surfaced as an editable section at the TOP of the panel. */
  caseTarget?: EditTarget | null;
  /** Canonical pipeline YAML; the component is read from / written back to it. */
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
  /** Close the inspector (deselect). Shown as an X in the header. */
  onClose?: () => void;
  /** A control-flow node's direct children (cases / steps), shown as a clickable list. */
  childItems?: InspectorChildItem[];
  /** Navigate the inspector to a child node. */
  onSelectChild?: (item: InspectorChildItem) => void;
};

// The lint message (if any) that falls on a switch case's routing `check` line — so the
// condition field can render its own error state, distinct from a problem in the component body.
function lintMessageOnCaseCheck(
  yaml: string,
  caseTarget: EditTarget,
  lintHints?: LintHint[]
): string | undefined {
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
 * The always-present right rail. Shows the selected node's identity and either a
 * schema-driven form (editable components) or scoped YAML (read-only / unknown
 * schema). Edits are written back into the canonical pipeline YAML at `target`.
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
}: NodeInspectorProps) {
  const component = useMemo(() => (target ? getComponentAt(yaml, target) : undefined), [yaml, target]);
  // The routing condition for a case-entry node, read from its switch case.
  const caseObject = useMemo(() => (caseTarget ? getComponentAt(yaml, caseTarget) : undefined), [yaml, caseTarget]);
  // A lint problem that lands on the condition's `check` line — so the condition field can show
  // its own error state (red), not just the banner at the top.
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

  // A switch case is edited for its routing condition only (its body is its own nodes).
  if (target.kind === 'switchCase') {
    return (
      <SwitchCaseEditor
        caseObject={component}
        onApply={(next) => {
          const updated = setComponentAt(yaml, target, next);
          if (updated !== null) {
            onApply(updated);
          }
        }}
        onClose={onClose}
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
  // The destructive remove action now lives in the footer (the header's trailing slot
  // is the close X). Disabled in read-only / when no delete handler is wired.
  const handleDelete = readOnly || !onDelete ? undefined : () => onDelete(target);

  // A resource's own label, and how many components reference it (shown as "Used by N").
  const resourceLabel = target.kind === 'resource' && typeof component.label === 'string' ? component.label : undefined;
  const usedByCount = resourceLabel ? countResourceReferences(yaml, resourceLabel) : 0;

  const handleApply = (next: Record<string, unknown>) => {
    let updated = setComponentAt(yaml, target, next);
    // Renaming a resource's label cascades to every component that references it, so the
    // link is never silently broken.
    if (updated !== null && target.kind === 'resource' && resourceLabel) {
      const nextLabel = typeof next.label === 'string' ? next.label : undefined;
      if (nextLabel && nextLabel !== resourceLabel) {
        updated = renameResourceReferences(updated, resourceLabel, nextLabel) ?? updated;
      }
    }
    if (updated !== null) {
      onApply(updated);
    }
  };

  // Resource labels for the `resource:` dropdowns in this component's form.
  const resourceLabels: Record<ResourceKind, string[]> = {
    cache: listResourceLabels(yaml, 'cache'),
    rate_limit: listResourceLabels(yaml, 'rate_limit'),
  };

  // A `resource:` reference on this component whose label has no matching resource —
  // surfaced as a fixable warning (the link would otherwise fail only at deploy).
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

  // Quick-fix a dangling reference: create the missing resource under that exact label
  // so the existing reference resolves.
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
        // A case-entry node routes "WHEN <check>" — its condition is edited at the top of the
        // panel (its own target). For the form editor it scrolls WITH the fields (headerSlot);
        // the rarer raw/read-only case-entries render it above the editor.
        const conditionSection =
          caseTarget && caseObject ? (
            <CaseConditionSection
              caseObject={caseObject}
              error={conditionError}
              onApply={(next) => {
                const updated = setComponentAt(yaml, caseTarget, next);
                if (updated !== null) {
                  onApply(updated);
                }
              }}
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
              onSelectChild={onSelectChild}
              // Re-key on the component's current value so that after Apply (the YAML
              // changes) the form re-initializes from the saved config — clearing the
              // dirty state so "Apply changes" disables and the edit is committed.
              key={JSON.stringify(component)}
              onApply={handleApply}
              onCreateResource={onCreateResource}
              resourceLabels={resourceLabels}
              spec={spec}
              value={component}
            />
          );
        }
        return (
          <>
            {conditionSection}
            <RawComponentEditor component={component} onApply={handleApply} />
          </>
        );
      })()}
    </div>
  );
}

// Secondary node actions (View in YAML, Delete) tucked into a 3-dot menu in the
// header, so the destructive Delete sits well away from the footer's Apply/Save.
const InspectorActionsMenu = ({ onOpenInYaml, onDelete }: { onOpenInYaml?: () => void; onDelete?: () => void }) => {
  if (!(onOpenInYaml || onDelete)) {
    return null;
  }
  return (
    <DropdownMenu>
      {/* Base UI uses `render` (not Radix `asChild`) to project the trigger onto our Button —
          so the menu trigger is the SAME icon-sm button as its neighbours (aligned, not nested). */}
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

// The inspector's bottom action bar: the component's own actions (Reset / Apply),
// right-aligned. Secondary actions live in the header's 3-dot menu, not here.
const InspectorFooter = ({ children }: { children?: React.ReactNode }) => {
  if (!children) {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-border border-t px-4 py-3">{children}</div>
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

// Apply a routing-condition `check` to a switch case, preserving key order: a non-empty check
// is set in place; an empty one is omitted (the default/else case). Rebuilds rather than
// `delete`-ing, so it stays out of the YAML's way and clean per the linter.
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

// Edits a switch case's routing condition (`check`). An empty condition makes it the
// default/else case. The case's body (processors / output) are separate nodes on the
// canvas; this rail only owns the condition.
const SwitchCaseEditor = ({
  caseObject,
  onApply,
  onDelete,
  onOpenInYaml,
  onClose,
  readOnly,
}: {
  caseObject: Record<string, unknown>;
  onApply: (next: Record<string, unknown>) => void;
  onDelete?: () => void;
  onOpenInYaml?: () => void;
  onClose?: () => void;
  readOnly?: boolean;
}) => {
  const initial = typeof caseObject.check === 'string' ? caseObject.check : '';
  const [check, setCheck] = useState(initial);
  useEffect(() => setCheck(initial), [initial]);
  const dirty = check !== initial;

  const apply = () => onApply(caseWithCheck(caseObject, check));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-border border-b px-4 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Box className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <Text as="span" className="text-muted-foreground uppercase tracking-wide" variant="captionStrongMedium">
            Switch
          </Text>
          <Text as="span" className="font-semibold" variant="bodyStrongMedium">
            Case condition
          </Text>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <InspectorActionsMenu onDelete={onDelete} onOpenInYaml={onOpenInYaml} />
          {onClose ? (
            <Button aria-label="Close" className="text-muted-foreground" onClick={onClose} size="icon-sm" variant="ghost">
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-4">
        <Label className="font-medium text-sm">Condition (check)</Label>
        <Input
          disabled={readOnly}
          onChange={(e) => setCheck(e.target.value)}
          placeholder='e.g. this.region == "us"'
          value={check}
        />
        <Text className="text-muted-foreground" variant="bodySmall">
          A Bloblang expression. Messages route to this case when it's true. Leave empty for the default (else) case.
        </Text>
      </div>
      <InspectorFooter>
        {readOnly ? null : (
          <Button disabled={!dirty} onClick={apply} type="button">
            Apply changes
          </Button>
        )}
      </InspectorFooter>
    </div>
  );
};

// The routing condition of a case-entry node, edited inline at the TOP of that node's
// inspector panel (gold, matching the on-canvas condition). Writes the case's `check`; an
// empty value means the default (else) case. Separate Apply from the component form below,
// since it targets the switch case, not the component.
const CaseConditionSection = ({
  caseObject,
  onApply,
  readOnly,
  error,
}: {
  caseObject: Record<string, unknown>;
  onApply: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
  /** A lint message on this condition — renders the input in its error state. */
  error?: string;
}) => {
  const initial = typeof caseObject.check === 'string' ? caseObject.check : '';
  const [check, setCheck] = useState(initial);
  useEffect(() => setCheck(initial), [initial]);
  const dirty = check !== initial;
  const apply = () => onApply(caseWithCheck(caseObject, check));
  return (
    <div className="border-condition/30 border-b bg-condition/5 px-4 py-3">
      <div className="flex items-center gap-1.5 pb-2">
        <Split className="size-3.5 text-condition" />
        <Label className="font-semibold text-[11px] text-condition uppercase tracking-wide">Routing condition</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label="About routing conditions"
                  className="text-condition/60 transition-colors hover:text-condition"
                  type="button"
                />
              }
            >
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              A Bloblang expression evaluated per message — this branch runs when it's true. Leave it empty to make
              this the default (else) case.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Input
        aria-invalid={error ? true : undefined}
        className="w-full font-mono"
        disabled={readOnly}
        onChange={(e) => setCheck(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && dirty) {
            apply();
          }
        }}
        placeholder='e.g. this.region == "us"'
        value={check}
      />
      {/* The field's own error message, so the problem is shown right where it's fixed (not
          only in the banner). Hidden once the user starts editing — they're addressing it. */}
      {error && !dirty ? (
        <Text className="flex items-center gap-1 pt-1.5 text-destructive" variant="bodySmall">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </Text>
      ) : null}
      {!readOnly && dirty ? (
        <div className="flex justify-end pt-2">
          <Button onClick={apply} size="sm" type="button" variant="ghost">
            Update condition
          </Button>
        </div>
      ) : null}
    </div>
  );
};

// A dangling `resource:` reference: the linked label has no matching resource. Offers
// a one-click fix that creates the missing resource under that label.
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
      <InspectorFooter>
        <Button disabled={draft === initial} onClick={apply} type="button">
          Apply changes
        </Button>
      </InspectorFooter>
    </div>
  );
};
