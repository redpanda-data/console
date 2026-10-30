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

import { zodResolver } from '@hookform/resolvers/zod';
import { ElementTooltip } from 'components/misc/element-tooltip';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { RadioGroup, RadioGroupItem } from 'components/redpanda-ui/components/radio-group';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  AlertCircle,
  AlertTriangle,
  CircleHelp,
  ExternalLink,
  Flag,
  Infinity as InfinityIcon,
  type LucideIcon,
  PowerOff,
} from 'lucide-react';
import { type KeyboardEvent, type ReactElement, type ReactNode, type SyntheticEvent, useId, useState } from 'react';
import { type Control, useForm, useWatch } from 'react-hook-form';
import { showToast } from 'utils/toast.utils';

import {
  backstopHint,
  DEFAULT_IDLE,
  draftFromStopForm,
  offersRestart,
  type StopFormState,
  type StopMode,
  stopFormSchema,
  stopFormState,
} from './stop-form';
import { getConnectorDocsUrl } from '../utils/connector-docs';
import type { InputEndBehavior, InputEndKind } from '../utils/input-end-behavior';
import { FLOW_STOP_ROW_H } from '../utils/pipeline-flow-layout';
import { CHILDLESS_WRAPPER, type StopSlot } from '../utils/pipeline-flow-parser';
import { CODE_SPAN_RE, type StopConditionDraft, stopRowText, stopSummary, withCaveat } from '../utils/read-until';
import { isStopConditionSet, READ_UNTIL } from '../utils/yaml';

const IDLE_PRESETS = ['10s', '30s', '1m', '5m'] as const;

// ── Presentation ───────────────────────────────────────────────────────────

type EndTone = 'set' | 'natural' | 'open' | 'invalid';

// How an end kind reads: set by a condition, natural, open-ended, or broken.
function endTone(kind: InputEndKind): EndTone {
  switch (kind) {
    case 'condition':
      return 'set';
    case 'natural':
      return 'natural';
    case 'invalid':
      return 'invalid';
    default:
      return 'open';
  }
}

const TONE_ICON: Record<EndTone, LucideIcon> = {
  set: Flag,
  natural: Flag,
  open: InfinityIcon,
  invalid: AlertCircle,
};

// Ends (by condition or by running dry) read as the input's success accent; a set condition is
// filled, a natural end outlined. Inputs that never end stay quiet and dashed.
const TONE_CLASS: Record<EndTone, string> = {
  set: 'border-success/50 bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-card))] text-success',
  natural: 'border-success/40 bg-card text-success',
  open: 'border-border border-dashed bg-card text-muted-foreground',
  invalid:
    'border-destructive/50 bg-[color-mix(in_srgb,var(--color-destructive)_10%,var(--color-card))] text-destructive',
};

// Behavior text marks config keys as `code`.
export const RichText = ({ text }: { text: string }) => (
  <>
    {text.split(CODE_SPAN_RE).map((part, i) =>
      i % 2 === 1 ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts of a fixed string; a code span's text can repeat.
        <code className="rounded bg-muted px-1 font-mono" key={`${i}-${part}`}>
          {part}
        </code>
      ) : (
        part
      )
    )}
  </>
);

// ── Editor ─────────────────────────────────────────────────────────────────

type StopConditionEditorProps = {
  /** The input's component name. */
  name: string;
  slot: StopSlot;
  effective: InputEndBehavior;
  /** Members of a broker/sequence each keep their own condition; this one ends them all at once. */
  isGroup?: boolean;
  readOnly?: boolean;
  /** False when the YAML edit is refused, which keeps the editor open. */
  onApply?: (draft: StopConditionDraft | null) => boolean;
  onClose: () => void;
};

const keepArrowKeys = (e: KeyboardEvent) => {
  if (e.key.startsWith('Arrow')) {
    e.stopPropagation();
  }
};

const ModeOption = ({
  value,
  selected,
  title,
  description,
  children,
}: {
  value: StopMode;
  selected: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) => {
  const id = useId();
  return (
    <div className={cn('rounded-md px-2.5 py-2 transition-colors', selected ? 'bg-muted/70' : 'hover:bg-muted/40')}>
      <Label className="cursor-pointer items-start" htmlFor={id}>
        {/* mr-0.5 widens the label's gap to line the text up with the fields below. */}
        <RadioGroupItem
          aria-describedby={description ? `${id}-description` : undefined}
          aria-label={title}
          className="mt-0.5 mr-0.5"
          id={id}
          value={value}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-body leading-tight font-medium">{title}</span>
          {description ? (
            <span className="text-body-sm font-normal text-muted-foreground" id={`${id}-description`}>
              {description}
            </span>
          ) : null}
        </span>
      </Label>
      {selected && children ? (
        // Arrow keys in these fields move the caret or focus, not the radio group's choice.
        // biome-ignore lint/a11y/noStaticElementInteractions: it only stops arrow keys bubbling up.
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: it only stops arrow keys bubbling up.
        <div className="flex flex-col gap-2 pt-2 pl-7.5" onKeyDown={keepArrowKeys}>
          {children}
        </div>
      ) : null}
    </div>
  );
};

type FormPartProps = { control: Control<StopFormState> };

// The idle timeout, typed or picked from a preset.
const IdleField = ({ control }: FormPartProps) => (
  <FormField
    control={control}
    name="idle"
    render={({ field }) => (
      <FormItem spacing="tight">
        <div className="flex flex-wrap items-center gap-1.5 font-mono">
          <FormControl
            render={
              <Input aria-label="Idle timeout" className="w-20" placeholder={DEFAULT_IDLE} size="sm" {...field} />
            }
          />
          {IDLE_PRESETS.map((preset) => (
            <Button
              aria-pressed={field.value.trim() === preset}
              key={preset}
              onClick={() => field.onChange(preset)}
              size="xs"
              type="button"
              variant={field.value.trim() === preset ? 'outline' : 'ghost'}
            >
              {preset}
            </Button>
          ))}
        </div>
        <FormMessage role="alert" />
      </FormItem>
    )}
  />
);

function noneOption(own: InputEndBehavior, isGroup?: boolean): { title: string; description: string } {
  if (isGroup) {
    const title = own.kind === 'natural' ? 'When all its inputs have stopped' : 'No stop condition of its own';
    return { title, description: 'Each input keeps its own stop condition.' };
  }
  if (own.kind === 'natural') {
    return { title: 'When it runs out of data', description: 'The default, so no stop condition is needed.' };
  }
  if (own.kind === 'continuous') {
    return { title: 'Keep running', description: 'Runs until the pipeline is stopped.' };
  }
  if (own.kind === 'condition') {
    return { title: 'Only its own stop condition', description: own.reason };
  }
  return { title: 'No stop condition', description: own.reason };
}

// What happens today; `editing` adds the nudge to the form below.
function currentBehavior(slot: StopSlot, effective: InputEndBehavior, editing = false): string {
  if (slot.locked) {
    // A wrapper with no input says so in its lock; any other lock follows the input's own reason.
    return slot.locked === CHILDLESS_WRAPPER
      ? slot.locked
      : `${withCaveat(effective.reason, effective)} ${slot.locked}`;
  }
  if (effective.kind === 'invalid') {
    // A broken input inside isn't fixed by this slot's own condition.
    return slot.ownEnd.kind === 'invalid' || !editing
      ? effective.reason
      : `${effective.reason} Choose how it should stop below, or keep it running.`;
  }
  // A condition that never acts (a zero timeout, a re-read input) says what happens instead.
  if (effective.kind !== 'condition' && isStopConditionSet(slot.condition)) {
    return withCaveat(editing ? `${effective.reason} Choose how it should stop below.` : effective.reason, effective);
  }
  const own = slot.ownEnd;
  const text = !slot.condition && own.finiteHint ? `${effective.reason} ${own.finiteHint}` : effective.reason;
  return withCaveat(text, effective);
}

const WarningLine = ({ text }: { text: string }) => (
  <span className="flex items-start gap-1 text-body-sm text-warning" data-testid="stop-backstop-hint">
    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
    {text}
  </span>
);

// Enter in the check adds a line; Cmd/Ctrl+Enter applies, as Enter does in the other fields.
function submitOnModEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}

// Clicks inside the portaled popup still bubble through React to the canvas node — keep them there.
const stopReactBubble = (e: SyntheticEvent) => e.stopPropagation();

// Re-reading an input that ends before the stop condition is met.
const RestartToggle = ({ control }: FormPartProps) => (
  <FormField
    control={control}
    name="restart"
    render={({ field }) => (
      <FormItem layout="horizontal-start" spacing="md">
        <FormControl
          render={
            <Checkbox
              checked={field.value}
              className="mt-0.5"
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          }
        />
        <div className="flex flex-col">
          <FormLabel className="cursor-pointer">
            <span className="text-body-sm font-normal">Read the input again if it finishes first</span>
          </FormLabel>
          <FormDescription>Keeps re-reading it until the condition is met.</FormDescription>
        </div>
      </FormItem>
    )}
  />
);

// Options that refine a count/check: an idle cut-off, and re-reading an input that ends before the
// condition is met.
const StopExtras = ({
  control,
  alsoIdle,
  restartOffered,
  hint,
}: FormPartProps & { alsoIdle: boolean; restartOffered: boolean; hint?: string }) => (
  <div className="flex flex-col gap-2">
    <FormField
      control={control}
      name="alsoIdle"
      render={({ field }) => (
        <FormItem layout="horizontal" spacing="md">
          <FormControl
            render={<Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />}
          />
          <FormLabel className="cursor-pointer">
            <span className="text-body-sm font-normal">Also stop when idle</span>
          </FormLabel>
        </FormItem>
      )}
    />
    {alsoIdle ? <IdleField control={control} /> : null}
    {restartOffered ? <RestartToggle control={control} /> : null}
    {hint ? <WarningLine text={hint} /> : null}
  </div>
);

const DocsLink = () => {
  const docsUrl = getConnectorDocsUrl('input', READ_UNTIL);
  return docsUrl ? (
    <a
      className="inline-flex items-center gap-1 text-body-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      href={docsUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      About <span className="font-mono">read_until</span>
      <ExternalLink className="size-3" />
    </a>
  ) : null;
};

const StopEditorFooter = ({ ownsEnd, onCancel }: { ownsEnd?: boolean; onCancel: () => void }) => (
  <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
    <p className="flex gap-2 text-body-sm text-muted-foreground">
      <PowerOff className="mt-0.5 size-3.5 shrink-0" />
      {ownsEnd
        ? 'This stops all of its inputs at once, whatever their own stop conditions. Once the pipeline’s inputs have stopped, it stops itself and uses no compute.'
        : 'Once every input has stopped, the pipeline stops itself and uses no compute until it’s started again.'}
    </p>
    <div className="flex items-center gap-2">
      <DocsLink />
      <div className="ml-auto flex items-center gap-2">
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary">
          Apply
        </Button>
      </div>
    </div>
  </div>
);

type StopEditorFormProps = Pick<StopConditionEditorProps, 'slot' | 'isGroup' | 'onClose'> & {
  onApply: (draft: StopConditionDraft | null) => boolean;
};

function StopEditorForm({ slot, isGroup, onApply, onClose }: StopEditorFormProps) {
  // Errors show once Apply is tried, then track each edit.
  const form = useForm<StopFormState>({
    resolver: zodResolver(stopFormSchema),
    defaultValues: stopFormState(slot.condition),
  });
  const { control } = form;
  const [mode, alsoIdle, restart, limit] = useWatch({ control, name: ['mode', 'alsoIdle', 'restart', 'limit'] });
  const none = noneOption(slot.ownEnd, isGroup);
  const restartOffered = offersRestart(mode, slot.ownEnd, slot.condition);
  const hint = backstopHint({ mode, alsoIdle, restart: restart && restartOffered, limit }, slot.ownEnd);
  const { batches } = slot.ownEnd;
  const extras = <StopExtras alsoIdle={alsoIdle} control={control} hint={hint} restartOffered={restartOffered} />;
  // A refused edit keeps the form open with the choices made in it.
  const apply = form.handleSubmit((values) => {
    if (onApply(draftFromStopForm(values, offersRestart(values.mode, slot.ownEnd, slot.condition)))) {
      onClose();
    }
  });

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(e) => {
          // React bubbles the submit out of the portal — keep it off any enclosing form.
          e.stopPropagation();
          // Invalid fields report inline; this catches an apply or close handler that throws.
          apply(e).catch((error: unknown) => {
            showToast({ status: 'error', title: 'Failed to apply the stop condition', description: String(error) });
          });
        }}
      >
        <FormField
          control={control}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormControl
                render={
                  <RadioGroup aria-label="Stop condition" onValueChange={field.onChange} value={field.value}>
                    {/* Sets the options' padding and spacing; the group's own gap acts on this one child. */}
                    <div className="grid gap-0.5 p-1.5">
                      <ModeOption
                        description={<RichText text={none.description} />}
                        selected={mode === 'none'}
                        title={none.title}
                        value="none"
                      />
                      <ModeOption
                        selected={mode === 'count'}
                        title={batches ? 'After a number of batches' : 'After a number of messages'}
                        value="count"
                      >
                        <FormField
                          control={control}
                          name="limit"
                          render={({ field: limitField }) => (
                            <FormItem spacing="tight">
                              <div className="flex items-center gap-2">
                                <FormControl
                                  render={
                                    <Input
                                      aria-label="Message limit"
                                      className="w-28"
                                      inputMode="numeric"
                                      size="sm"
                                      {...limitField}
                                    />
                                  }
                                />
                                <span className="text-body-sm text-muted-foreground">
                                  {batches ? 'batches' : 'messages'}
                                </span>
                              </div>
                              <FormMessage role="alert" />
                              <FormDescription>
                                {batches
                                  ? 'This input reads in batches, and each counts once, so it can read many more messages.'
                                  : 'An input that batches counts each batch once.'}
                              </FormDescription>
                            </FormItem>
                          )}
                        />
                        {extras}
                      </ModeOption>
                      <ModeOption
                        description="No new message arrives for a while — counted from startup, too."
                        selected={mode === 'idle'}
                        title="When it goes idle"
                        value="idle"
                      >
                        <IdleField control={control} />
                        {restartOffered ? <RestartToggle control={control} /> : null}
                        {hint ? <WarningLine text={hint} /> : null}
                      </ModeOption>
                      <ModeOption selected={mode === 'check'} title="When a message matches" value="check">
                        <FormField
                          control={control}
                          name="check"
                          render={({ field: checkField }) => (
                            <FormItem spacing="tight">
                              {/* Multi-line: a check can span lines (`let` statements, comments). */}
                              {/* The field inherits its mono font from here. */}
                              <div className="font-mono">
                                <FormControl
                                  render={
                                    <Textarea
                                      aria-label="Bloblang condition"
                                      onKeyDown={submitOnModEnter}
                                      placeholder='this.status == "done"'
                                      size="sm"
                                      {...checkField}
                                    />
                                  }
                                />
                              </div>
                              <FormMessage role="alert" />
                              <FormDescription>
                                {batches
                                  ? 'A Bloblang query on the first message of each batch this input reads; the matching batch is the last one read.'
                                  : 'A Bloblang query; the matching message is the last one read.'}
                              </FormDescription>
                            </FormItem>
                          )}
                        />
                        {extras}
                      </ModeOption>
                    </div>
                  </RadioGroup>
                }
              />
            </FormItem>
          )}
        />
        <StopEditorFooter onCancel={onClose} ownsEnd={isGroup && mode !== 'none'} />
      </form>
    </Form>
  );
}

export function StopConditionEditor({
  name,
  slot,
  effective,
  isGroup,
  readOnly,
  onApply,
  onClose,
}: StopConditionEditorProps) {
  const editing = Boolean(onApply) && !(readOnly || slot.locked);
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border-b border-border px-4 py-3">
        <span className="text-body font-semibold">
          {editing ? 'When should ' : 'When '}
          <span className="font-mono">{name}</span>
          {editing ? ' stop?' : ' stops'}
        </span>
        <span className="text-body-sm text-muted-foreground">
          <RichText text={currentBehavior(slot, effective, editing)} />
        </span>
      </div>
      {editing && onApply ? (
        <StopEditorForm isGroup={isGroup} onApply={onApply} onClose={onClose} slot={slot} />
      ) : (
        <div className="px-4 py-3">
          <DocsLink />
        </div>
      )}
    </div>
  );
}

type StopConditionPopoverProps = Omit<StopConditionEditorProps, 'onClose'> & {
  /** The trigger element (rendered via Base UI `render`). */
  trigger: ReactElement;
  /** A tooltip on the trigger. */
  tooltip?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
};

/** A trigger that opens the stop-condition editor (or, read-only, its explanation) in a popover. */
function StopConditionPopover({
  trigger,
  tooltip,
  side = 'bottom',
  align = 'start',
  ...editor
}: StopConditionPopoverProps) {
  const [open, setOpen] = useState(false);
  const [opens, setOpens] = useState(0);
  return (
    <Popover
      onOpenChange={(next) => {
        if (next) {
          setOpens((n) => n + 1);
        }
        setOpen(next);
      }}
      open={open}
    >
      <ElementTooltip content={tooltip}>
        <PopoverTrigger render={trigger} />
      </ElementTooltip>
      <PopoverContent
        align={align}
        aria-label={`Stop condition for ${editor.name}`}
        className="w-[22rem]"
        onClick={stopReactBubble}
        onPointerDown={stopReactBubble}
        side={side}
        sideOffset={6}
      >
        {/* The editor's sections run edge to edge, over the popover's padding. */}
        <div className="-m-4">
          {/* Keyed per open, so a cancelled edit never lingers into the next one. */}
          <StopConditionEditor {...editor} key={opens} onClose={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Stop row ───────────────────────────────────────────────────────────────

type StopRowProps = {
  name: string;
  slot: StopSlot;
  effective: InputEndBehavior;
  onApply?: (draft: StopConditionDraft | null) => boolean;
};

/**
 * An input's end as a full-width row at the foot of its card, or of its broker/sequence marker: when it
 * stops, and the quick action to change that. Its height matches the layout's reserved row.
 */
export function StopRow({ name, slot, effective, onApply, isGroup }: StopRowProps & { isGroup?: boolean }) {
  const tone = endTone(effective.kind);
  const Icon = TONE_ICON[tone];
  const editable = Boolean(onApply) && !slot.locked;
  const { eyebrow, text } = stopRowText(name, slot, effective, { isGroup, editable });
  const sentence = stopSummary(slot, effective).long;
  return (
    <StopConditionPopover
      effective={effective}
      isGroup={isGroup}
      name={name}
      onApply={onApply}
      readOnly={!editable}
      side="bottom"
      slot={slot}
      tooltip={sentence}
      trigger={
        <button
          aria-label={`${eyebrow} ${text}: ${editable ? 'edit the stop condition' : 'stop condition'} for ${name}`}
          className={cn(
            // -mt-px folds its top rule into the header's when nothing sits between them.
            'nodrag nopan -mt-px flex w-full cursor-pointer items-center gap-1.5 border-t border-border/60 px-3 text-left text-body-sm transition-colors hover:bg-muted/50',
            tone === 'open' && 'text-muted-foreground',
            tone === 'invalid' && 'text-destructive'
          )}
          data-end={effective.kind}
          data-testid="stop-row"
          // A quick action: opening it must not also select the card it sits on.
          onClick={stopReactBubble}
          style={{ height: FLOW_STOP_ROW_H }}
          type="button"
        >
          <TonedIcon
            className="size-3.5 shrink-0"
            fill={tone === 'set' ? 'currentColor' : 'none'}
            icon={Icon}
            tone={tone === 'set' || tone === 'natural' ? 'success' : 'default'}
          />
          <span className="shrink-0 text-2xs font-semibold tracking-wide uppercase opacity-80">{eyebrow}</span>
          {/* Keyed on the text so a changed condition fades in rather than switching silently. */}
          <span className="min-w-0 flex-1 animate-in truncate duration-200 fade-in" key={text}>
            {text}
          </span>
        </button>
      }
    />
  );
}

// ── Inspector section ──────────────────────────────────────────────────────

/** The selected input's stop condition, under the inspector header, with the same editor. */
export function StopConditionSection({
  name,
  slot,
  effective,
  isGroup,
  onApply,
}: StopRowProps & { isGroup?: boolean }) {
  const tone = endTone(effective.kind);
  const Icon = TONE_ICON[tone];
  const set = slot.condition !== undefined;
  const sentence = currentBehavior(slot, effective);
  return (
    <div
      className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3"
      data-testid="stop-condition-section"
    >
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border',
          TONE_CLASS[tone],
          tone === 'open' && 'border-solid'
        )}
      >
        <Icon className="size-3.5" fill={tone === 'set' ? 'currentColor' : 'none'} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">Stop condition</span>
        <span className="text-body-sm">
          <RichText text={sentence} />
        </span>
      </div>
      {onApply && !slot.locked ? (
        <StopConditionPopover
          align="end"
          effective={effective}
          isGroup={isGroup}
          name={name}
          onApply={onApply}
          slot={slot}
          trigger={
            <Button
              aria-label={`${set ? 'Edit' : 'Set'} the stop condition for ${name}`}
              className="shrink-0"
              size="xs"
              type="button"
              variant="outline"
            >
              {set ? 'Edit' : 'Set'}
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

export const StopKindIcon = ({ kind, className }: { kind: InputEndKind; className?: string }) => {
  const Icon = kind === 'unknown' ? CircleHelp : TONE_ICON[endTone(kind)];
  return <Icon className={className} />;
};
