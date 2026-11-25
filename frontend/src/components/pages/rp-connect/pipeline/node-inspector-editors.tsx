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
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { pluralizeWithNumber } from 'utils/string';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';

import type { UnmappedLintHint } from './lint-field-mapping';
import { isCommitShortcut, PendingEditsBar } from './node-config-form';
import { isObject } from '../../../../utils/type-guards';
import { ConnectorLogo } from '../onboarding/connector-logo';
import { setComponentAt } from '../utils/yaml-component-editing';
import type { EditTarget } from '../utils/yaml-edit-target';
import { renameResourceReferences, resourceRefKindForTarget } from '../utils/yaml-resources';

// Which node the inspector shows: its canvas id, which a stop condition wrapping it or its broker doesn't
// change, else its path.
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
    {Boolean(children) ? <AlertDescription>{children}</AlertDescription> : null}
  </Alert>
);

// Lint problems for the selected node that didn't anchor to a form field, shown above its config.
// No line numbers — there are none to see in this view; when the problem's line resolved to a
// known (unrendered) field, its name is shown instead.
export const InspectorLintErrors = ({ hints }: { hints: UnmappedLintHint[] }) => (
  <InspectorBanner title={pluralizeWithNumber(hints.length, 'problem')} tone="destructive">
    <ul className="flex flex-col gap-1">
      {hints.map(({ hint, fieldLabel }) => (
        <li className="text-body-sm" key={`${hint.line}-${hint.column}-${hint.hint}-${fieldLabel ?? ''}`}>
          {hint.hint}
          {fieldLabel !== null && fieldLabel !== undefined && fieldLabel !== '' ? (
            <span className="text-muted-foreground"> ({fieldLabel})</span>
          ) : null}
        </li>
      ))}
    </ul>
  </InspectorBanner>
);

// Write a component-config draft at `target`, cascading a resource-label rename to every component
// that references it (so the link is never silently broken).
export function applyComponentDraft(
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
  if (refKind && originalLabel !== null && originalLabel !== undefined && originalLabel !== '') {
    const nextLabel = typeof config.label === 'string' ? config.label : undefined;
    if (nextLabel !== null && nextLabel !== undefined && nextLabel !== '' && nextLabel !== originalLabel) {
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
    aria-invalid={invalid === true ? true : undefined}
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
export const SwitchCaseEditor = ({
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
export const CaseConditionSection = ({
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
                <Button
                  aria-label="About routing conditions"
                  // biome-ignore lint/nursery/noTailwindRestyledComponents: Registry unstyled variant owns this compound control's appearance.
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-warning/50 transition-colors hover:text-warning"
                  type="button"
                  variant="unstyled"
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
      {error !== null && error !== undefined && error !== '' && !dirty ? (
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
export const DanglingRefBanner = ({ refLabel, onCreate }: { refLabel: string; onCreate: () => void }) => (
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

// The component still loads and saves; this only steers the user toward the replacement.
export const DeprecatedComponentBanner = ({ messages }: { messages: string[] }) => (
  <InspectorBanner title="Deprecated component" tone="warning">
    {[...new Set(messages)].map((message) => (
      <p key={message}>{message}</p>
    ))}
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

export const InspectorEmptyState = ({ readOnly }: { readOnly?: boolean }) => (
  <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
    <div className="flex size-14 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
      <MousePointerSquareDashed className="size-7" />
    </div>
    <div className="flex max-w-[16rem] flex-col gap-1">
      <div className="text-body font-medium">No node selected</div>
      <div className="text-body-sm text-muted-foreground">
        {readOnly === true
          ? 'Select a node on the canvas to inspect its configuration.'
          : 'Select a node on the canvas to view and edit its configuration.'}
      </div>
    </div>
    <ul className="flex flex-col gap-2.5 text-left">
      <EmptyHint icon={MousePointerClick}>Click any node to {readOnly === true ? 'inspect' : 'edit'} it</EmptyHint>
      {readOnly === true ? null : <EmptyHint icon={Plus}>Use the + on a connector line to insert a step</EmptyHint>}
    </ul>
  </div>
);

export const InspectorHeader = ({
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
    <ConnectorLogo className="size-6 shrink-0" fallback={Box} name={componentName} />
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
      {docsUrl !== null && docsUrl !== undefined && docsUrl !== '' ? (
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
export const ReadOnlyComponent = ({ component }: { component: Record<string, unknown> }) => (
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
  } catch (error) {
    return { config: null, error: error instanceof Error ? error.message : 'Invalid YAML' };
  }
  if (!isObject(parsed) || Array.isArray(parsed)) {
    return { config: null, error: 'Configuration must be a YAML mapping.' };
  }
  return { config: parsed, error: null };
}

// Whether a draft holds the component `yaml` does, formatting and comments aside.
function draftMatches(draft: string, yaml: string): boolean {
  if (draft === yaml) {
    return true;
  }
  const { config } = parseComponentDraft(draft);
  return config !== null && yamlStringify(config) === yaml;
}

// The raw editor's text, and the pending config it parses to (null when clean).
function useComponentDraft(component: Record<string, unknown>) {
  const initial = useMemo(() => yamlStringify(component), [component]);
  const [draft, setDraft] = useState(initial);
  // The node's YAML changed under the editor (this draft committed, or an edit elsewhere): a draft
  // matching the old YAML follows it, an edited one is kept. Adjusted in render, so no render pairs
  // the old draft with the new YAML; in place, so focus, caret and scroll survive a commit.
  const [baseline, setBaseline] = useState(initial);
  if (baseline !== initial) {
    setBaseline(initial);
    if (draftMatches(draft, baseline)) {
      setDraft(initial);
    }
  }

  // Parse the draft live. Only a valid draft that changes the component is pending and reported, so
  // invalid YAML is never committed and a whitespace or comment edit isn't reformatted into the YAML.
  const { config, error } = useMemo(() => {
    const parsed = draft === initial ? CLEAN_COMPONENT_DRAFT : parseComponentDraft(draft);
    return parsed.config && yamlStringify(parsed.config) === initial ? CLEAN_COMPONENT_DRAFT : parsed;
  }, [draft, initial]);
  return { draft, setDraft, config, error };
}

// Fallback editor for components without a known schema (e.g. bloblang mappings): scoped, editable YAML.
export const RawComponentEditor = ({
  component,
  onConfigChange,
  onCommitField,
}: {
  component: Record<string, unknown>;
  onConfigChange?: (next: Record<string, unknown> | null) => void;
  onCommitField?: () => boolean;
}) => {
  const { draft, setDraft, config, error } = useComponentDraft(component);
  useEffect(() => {
    onConfigChange?.(config);
  }, [config, onConfigChange]);

  // Like the schema form: a pending edit applies on Apply, ⌘⏎, or focus leaving the editor.
  const pending = config !== null;
  const commitNow = () => {
    if (pending) {
      onCommitField?.();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: passive listener for events bubbling from the editor.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: passive listener for events bubbling from the editor.
    <div
      className="flex min-h-0 flex-1 flex-col"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          commitNow();
        }
      }}
      // Capture phase, or Monaco takes ⌘⏎ as "insert line below" first (which it still does when
      // nothing is pending).
      onKeyDownCapture={(e) => {
        if (pending && onCommitField && isCommitShortcut(e)) {
          e.preventDefault();
          e.stopPropagation();
          commitNow();
        }
      }}
    >
      {/* Flex column so the editor shrinks to leave room for the error row below it. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
          <YamlEditor
            onChange={(v) => setDraft((v ?? '') || '')}
            options={{ minimap: { enabled: false } }}
            transparentBackground
            value={draft}
          />
        </div>
        {error !== null && error !== undefined && error !== '' ? (
          <div className="shrink-0 text-body-sm text-destructive">{error}</div>
        ) : null}
      </div>
      {onCommitField && pending ? <PendingEditsBar onApply={commitNow} /> : null}
    </div>
  );
};
