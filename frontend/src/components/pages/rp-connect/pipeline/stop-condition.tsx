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
import { z } from 'zod';

import { getConnectorDocsUrl } from '../utils/connector-docs';
import type { InputEndBehavior, InputEndKind } from '../utils/input-end-behavior';
import type { StopSlot } from '../utils/pipeline-flow-parser';
import {
  describeStopCondition,
  isValidIdleTimeout,
  parseMessageLimit,
  type StopConditionDraft,
  stopShortLabel,
} from '../utils/read-until';
import { isStopConditionSet, READ_UNTIL, type StopCondition } from '../utils/yaml';

// ── Form model ─────────────────────────────────────────────────────────────

const STOP_MODES = ['none', 'count', 'idle', 'check'] as const;

export type StopMode = (typeof STOP_MODES)[number];

const DEFAULT_LIMIT = '1000';
const DEFAULT_IDLE = '30s';
const IDLE_PRESETS = ['10s', '30s', '1m', '5m'] as const;
const POSITIVE_INT_RE = /^\d+$/;

const usesIdle = (s: { mode: StopMode; alsoIdle: boolean }): boolean =>
  s.mode === 'idle' || (s.mode !== 'none' && s.alsoIdle);

/** The editor's form. Each field is checked only when the chosen mode reads it. */
export const stopFormSchema = z
  .object({
    mode: z.enum(STOP_MODES),
    limit: z.string(),
    idle: z.string(),
    check: z.string(),
    /** With a count/check: also stop once idle. */
    alsoIdle: z.boolean(),
    restart: z.boolean(),
  })
  .superRefine((s, ctx) => {
    const issue = (path: 'limit' | 'idle' | 'check', message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    const limit = s.limit.trim();
    if (
      s.mode === 'count' &&
      !(POSITIVE_INT_RE.test(limit) && Number(limit) > 0 && Number.isSafeInteger(Number(limit)))
    ) {
      issue('limit', 'Enter a whole number greater than 0.');
    }
    if (s.mode === 'check' && s.check.trim() === '') {
      issue('check', 'Enter a Bloblang condition.');
    }
    if (usesIdle(s) && !isValidIdleTimeout(s.idle)) {
      issue('idle', 'Enter a duration such as 30s, 5m or 1h.');
    }
  });

export type StopFormState = z.infer<typeof stopFormSchema>;

/** The editor's starting state for a slot's current condition. */
export function stopFormState(condition?: StopCondition): StopFormState {
  const state: StopFormState = {
    mode: 'none',
    limit: DEFAULT_LIMIT,
    idle: condition?.idleTimeout ?? DEFAULT_IDLE,
    check: '',
    alsoIdle: false,
    restart: Boolean(condition?.restartInput),
  };
  if (!isStopConditionSet(condition)) {
    return state;
  }
  const limit = parseMessageLimit(condition.check);
  if (limit) {
    return { ...state, mode: 'count', limit: String(limit.limit), alsoIdle: Boolean(condition.idleTimeout) };
  }
  if (condition.check) {
    return { ...state, mode: 'check', check: condition.check, alsoIdle: Boolean(condition.idleTimeout) };
  }
  return { ...state, mode: 'idle' };
}

/**
 * Whether the form offers `restart_input`: with a count or check, for an input that can finish before
 * it's met (with an idle timeout alone, a re-read input never goes idle). One the YAML already sets
 * stays on offer, so applying never drops it unseen.
 */
export function offersRestart(mode: StopMode, own: InputEndBehavior, condition?: StopCondition): boolean {
  return Boolean(condition?.restartInput) || ((mode === 'count' || mode === 'check') && own.kind !== 'continuous');
}

/** What the form asks for; null keeps the input running with no stop condition. */
export function draftFromStopForm(s: StopFormState, restartOffered = true): StopConditionDraft | null {
  if (s.mode === 'none') {
    return null;
  }
  const idleTimeout = usesIdle(s) ? s.idle.trim() : undefined;
  const restartInput = (restartOffered && s.restart) || undefined;
  if (s.mode === 'idle') {
    return { idleTimeout, restartInput };
  }
  if (s.mode === 'count') {
    return { messageLimit: Number(s.limit.trim()), idleTimeout, restartInput };
  }
  return { check: s.check.trim(), idleTimeout, restartInput };
}

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

const CODE_SPAN_RE = /`([^`]+)`/g;
const plain = (text: string): string => text.replace(CODE_SPAN_RE, '$1');

const withCaveat = (text: string, behavior: InputEndBehavior) =>
  behavior.caveat ? `${text} ${behavior.caveat}` : text;

/** An input's one-line end label, plus the plain-text sentence for its tooltip. */
export function stopSummary(slot: StopSlot, effective: InputEndBehavior): { short: string; long: string } {
  const short = stopShortLabel(slot, effective);
  const note =
    effective.kind === 'continuous' && !isStopConditionSet(slot.condition) ? ' No stop condition is set.' : '';
  return { short, long: plain(`${withCaveat(effective.reason, effective)}${note}`) };
}

// Behavior text marks config keys as `code`.
export const RichText = ({ text }: { text: string }) => (
  <>
    {text.split(CODE_SPAN_RE).map((part, i) =>
      i % 2 === 1 ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts of a fixed string; a code span's text can repeat.
        <code className="rounded bg-muted px-1 font-mono text-[0.95em]" key={`${i}-${part}`}>
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
  onApply?: (draft: StopConditionDraft | null) => void;
  onClose: () => void;
};

const ModeOption = ({
  id,
  value,
  selected,
  title,
  description,
  children,
}: {
  id: string;
  value: StopMode;
  selected: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) => (
  <div className={cn('rounded-md px-2.5 py-2 transition-colors', selected ? 'bg-muted/70' : 'hover:bg-muted/40')}>
    <Label className="cursor-pointer items-start gap-2.5">
      <RadioGroupItem
        aria-describedby={description ? `${id}-description` : undefined}
        aria-label={title}
        className="mt-0.5"
        value={value}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-body leading-tight">{title}</span>
        {description ? (
          <span className="font-normal text-body-sm text-muted-foreground" id={`${id}-description`}>
            {description}
          </span>
        ) : null}
      </span>
    </Label>
    {selected && children ? <div className="flex flex-col gap-2 pt-2 pl-7.5">{children}</div> : null}
  </div>
);

const FieldMessage = () => <FormMessage className="text-body-sm" role="alert" />;

type FormPartProps = { control: Control<StopFormState> };

// The idle timeout, typed or picked from a preset.
const IdleField = ({ control }: FormPartProps) => (
  <FormField
    control={control}
    name="idle"
    render={({ field }) => (
      <FormItem spacing="tight">
        <div className="flex flex-wrap items-center gap-1.5">
          <FormControl
            render={
              <Input
                aria-label="Idle timeout"
                className="w-20 font-mono"
                placeholder={DEFAULT_IDLE}
                size="sm"
                {...field}
              />
            }
          />
          {IDLE_PRESETS.map((preset) => (
            <Button
              aria-pressed={field.value.trim() === preset}
              className="font-mono"
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
        <FieldMessage />
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

// The header line under the title: what happens today.
function currentBehavior(slot: StopSlot, effective: InputEndBehavior): string {
  if (slot.locked) {
    return slot.locked;
  }
  if (effective.kind === 'invalid') {
    // A broken input inside isn't fixed by this slot's own condition.
    return slot.ownEnd.kind === 'invalid'
      ? effective.reason
      : `${effective.reason} Choose how it should stop below, or keep it running.`;
  }
  // A condition that never acts (a zero timeout, a re-read input) says what happens instead.
  if (effective.kind !== 'condition' && isStopConditionSet(slot.condition)) {
    return withCaveat(`${effective.reason} Choose how it should stop below.`, effective);
  }
  const own = slot.ownEnd;
  const text = !slot.condition && own.finiteHint ? `${effective.reason} ${own.finiteHint}` : effective.reason;
  return withCaveat(text, effective);
}

// What can still leave the input running with the condition as chosen.
function backstopHint(
  s: Pick<StopFormState, 'mode' | 'restart' | 'alsoIdle' | 'limit'>,
  own: InputEndBehavior
): string | undefined {
  const rereads = s.restart && own.kind !== 'continuous';
  if (s.mode === 'idle') {
    return rereads
      ? 'The input is read again each time it finishes, so it never goes idle and never stops.'
      : undefined;
  }
  if (!(s.mode === 'count' || s.mode === 'check')) {
    return;
  }
  if (rereads) {
    return 'If no message ever meets the condition, the input is read again and again and never stops.';
  }
  if (s.alsoIdle || own.kind !== 'continuous') {
    return;
  }
  const limit = s.limit.trim();
  const shortfall =
    s.mode === 'count' && POSITIVE_INT_RE.test(limit) ? `If fewer than ${limit} messages arrive` : 'If none arrives';
  return `${shortfall}, it keeps running. Also stop when idle as a backstop.`;
}

const WarningLine = ({ text }: { text: string }) => (
  <span className="flex items-start gap-1 text-body-sm text-warning" data-testid="stop-backstop-hint">
    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
    {text}
  </span>
);

// Escape closes only this popover; the canvas's Escape-to-deselect skips handled events.
export function claimEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
  }
}

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
          <FormLabel className="cursor-pointer font-normal text-body-sm">
            Read the input again if it finishes first
          </FormLabel>
          <FormDescription className="text-muted-foreground">
            Keeps re-reading it until the condition is met.
          </FormDescription>
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
          <FormLabel className="cursor-pointer font-normal text-body-sm">Also stop when idle</FormLabel>
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

const StopEditorFooter = ({ isGroup, onCancel }: { isGroup?: boolean; onCancel: () => void }) => (
  <div className="flex flex-col gap-3 border-border border-t px-4 py-3">
    <p className="flex gap-2 text-body-sm text-muted-foreground">
      <PowerOff className="mt-0.5 size-3.5 shrink-0" />
      {isGroup
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
  onApply: (draft: StopConditionDraft | null) => void;
};

function StopEditorForm({ slot, isGroup, onApply, onClose }: StopEditorFormProps) {
  // Errors show once Apply is tried, then track each edit.
  const form = useForm<StopFormState>({
    resolver: zodResolver(stopFormSchema),
    defaultValues: stopFormState(slot.condition),
  });
  const { control } = form;
  const [mode, alsoIdle, restart, limit] = useWatch({ control, name: ['mode', 'alsoIdle', 'restart', 'limit'] });
  const idPrefix = useId();
  const none = noneOption(slot.ownEnd, isGroup);
  const restartOffered = offersRestart(mode, slot.ownEnd, slot.condition);
  const hint = backstopHint({ mode, alsoIdle, restart, limit }, slot.ownEnd);
  const extras = <StopExtras alsoIdle={alsoIdle} control={control} hint={hint} restartOffered={restartOffered} />;
  const apply = form.handleSubmit((values) => {
    onApply(draftFromStopForm(values, offersRestart(values.mode, slot.ownEnd, slot.condition)));
    onClose();
  });

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(e) => {
          // React bubbles the submit out of the portal — keep it off any enclosing form.
          e.stopPropagation();
          apply(e);
        }}
      >
        <FormField
          control={control}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormControl
                render={
                  <RadioGroup
                    aria-label="Stop condition"
                    className="gap-0.5 p-1.5"
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <ModeOption
                      description={<RichText text={none.description} />}
                      id={`${idPrefix}-none`}
                      selected={mode === 'none'}
                      title={none.title}
                      value="none"
                    />
                    <ModeOption
                      id={`${idPrefix}-count`}
                      selected={mode === 'count'}
                      title="After a number of messages"
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
                              <span className="text-body-sm text-muted-foreground">messages</span>
                            </div>
                            <FieldMessage />
                            <FormDescription className="text-muted-foreground">
                              An input that batches counts each batch once.
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                      {extras}
                    </ModeOption>
                    <ModeOption
                      description="No new message arrives for a while — counted from startup, too."
                      id={`${idPrefix}-idle-mode`}
                      selected={mode === 'idle'}
                      title="When it goes idle"
                      value="idle"
                    >
                      <IdleField control={control} />
                      {restartOffered ? <RestartToggle control={control} /> : null}
                      {hint ? <WarningLine text={hint} /> : null}
                    </ModeOption>
                    <ModeOption
                      id={`${idPrefix}-check`}
                      selected={mode === 'check'}
                      title="When a message matches"
                      value="check"
                    >
                      <FormField
                        control={control}
                        name="check"
                        render={({ field: checkField }) => (
                          <FormItem spacing="tight">
                            {/* Multi-line: a check can span lines (`let` statements, comments). */}
                            <FormControl
                              render={
                                <Textarea
                                  aria-label="Bloblang condition"
                                  className="font-mono"
                                  onKeyDown={submitOnModEnter}
                                  placeholder='this.status == "done"'
                                  size="sm"
                                  {...checkField}
                                />
                              }
                            />
                            <FieldMessage />
                            <FormDescription className="text-muted-foreground">
                              A Bloblang query; the matching message is the last one read.
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                      {extras}
                    </ModeOption>
                  </RadioGroup>
                }
              />
            </FormItem>
          )}
        />
        <StopEditorFooter isGroup={isGroup} onCancel={onClose} />
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
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border-border border-b px-4 py-3">
        <span className="font-semibold text-body">
          {readOnly || slot.locked ? 'When ' : 'When should '}
          <span className="font-mono">{name}</span>
          {readOnly || slot.locked ? ' stops' : ' stop?'}
        </span>
        <span className="text-body-sm text-muted-foreground">
          <RichText text={currentBehavior(slot, effective)} />
        </span>
      </div>
      {readOnly || !onApply || slot.locked ? (
        <div className="px-4 py-3">
          <DocsLink />
        </div>
      ) : (
        <StopEditorForm isGroup={isGroup} onApply={onApply} onClose={onClose} slot={slot} />
      )}
    </div>
  );
}

type StopConditionPopoverProps = Omit<StopConditionEditorProps, 'onClose'> & {
  /** The trigger element (rendered via Base UI `render`). */
  trigger: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
};

/** A trigger that opens the stop-condition editor (or, read-only, its explanation) in a popover. */
export function StopConditionPopover({
  trigger,
  side = 'bottom',
  align = 'start',
  ...editor
}: StopConditionPopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align={align}
        aria-label={`Stop condition for ${editor.name}`}
        className="w-[22rem] p-0"
        onClick={stopReactBubble}
        onKeyDown={claimEscape}
        onPointerDown={stopReactBubble}
        side={side}
        sideOffset={6}
      >
        {/* Mounted per open, so a cancelled edit never lingers into the next one. */}
        {open ? <StopConditionEditor {...editor} onClose={() => setOpen(false)} /> : null}
      </PopoverContent>
    </Popover>
  );
}

// ── Stop row ───────────────────────────────────────────────────────────────

type StopRowProps = {
  name: string;
  slot: StopSlot;
  effective: InputEndBehavior;
  onApply?: (draft: StopConditionDraft | null) => void;
};

// "its input never stops", "none of its 3 inputs stop", "2 of 3 inputs never stop".
function continuousShare(n: number, total: number): string {
  if (total === 1) {
    return 'its input never stops';
  }
  if (n === total) {
    return `none of its ${total} inputs stop`;
  }
  return `${n} of ${total} inputs never ${n === 1 ? 'stops' : 'stop'}`;
}

// "its input", "all 3 inputs", "1 of 3 inputs".
function whichMembers(n: number, total: number): string {
  if (total === 1) {
    return 'its input';
  }
  return n === total ? `all ${total} inputs` : `${n} of ${total} inputs`;
}

// A broker/sequence: what its members add up to.
function groupEndText(name: string, effective: InputEndBehavior): { eyebrow: string; text: string } {
  const m = effective.members;
  switch (effective.kind) {
    case 'natural':
      return { eyebrow: 'Stops', text: name === 'sequence' ? 'after its last input stops' : 'once all inputs stop' };
    case 'continuous':
      return { eyebrow: 'Continuous', text: m ? continuousShare(m.continuous, m.total) : plain(effective.reason) };
    case 'invalid':
      return {
        eyebrow: 'Fix stop',
        text: m ? `${whichMembers(m.invalid, m.total)} incomplete` : plain(effective.reason),
      };
    default:
      return {
        eyebrow: 'Stops?',
        text: m ? `${whichMembers(m.unknown, m.total)} may not stop` : plain(effective.reason),
      };
  }
}

// A single input, short enough for its card: how it ends without a condition, or why that one doesn't act.
function inputEndText(
  slot: StopSlot,
  effective: InputEndBehavior,
  editable: boolean
): { eyebrow: string; text: string } {
  const wrapped = slot.condition !== undefined;
  switch (effective.kind) {
    case 'natural':
      return { eyebrow: 'Stops', text: 'when its data runs out' };
    case 'continuous':
      if (wrapped) {
        return { eyebrow: 'Continuous', text: 'condition never fires' };
      }
      return { eyebrow: 'Continuous', text: editable ? 'set a stop condition' : 'no stop condition' };
    case 'invalid':
      return { eyebrow: 'Fix stop', text: wrapped ? 'condition incomplete' : plain(effective.reason) };
    default:
      return { eyebrow: 'Stops?', text: 'may not stop on its own' };
  }
}

/** A stop row's eyebrow + text: the stop condition while it's what ends the input, otherwise how it ends. */
export function stopRowText(
  name: string,
  slot: StopSlot,
  effective: InputEndBehavior,
  { isGroup = false, editable = false }: { isGroup?: boolean; editable?: boolean } = {}
): { eyebrow: string; text: string } {
  if (effective.kind === 'condition' && isStopConditionSet(slot.condition)) {
    const summary = describeStopCondition(slot.condition);
    return { eyebrow: 'Stops', text: isGroup ? summary.long : summary.compact };
  }
  return isGroup ? groupEndText(name, effective) : inputEndText(slot, effective, editable);
}

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
      trigger={
        <button
          aria-label={`${eyebrow} ${text}: ${editable ? 'edit the stop condition' : 'stop condition'} for ${name}`}
          className={cn(
            // -mt-px folds its top rule into the header's when nothing sits between them.
            'nodrag nopan -mt-px flex h-[30px] w-full cursor-pointer items-center gap-1.5 border-border/60 border-t px-3 text-left text-body-sm transition-colors hover:bg-muted/50',
            tone === 'open' && 'text-muted-foreground',
            tone === 'invalid' && 'text-destructive'
          )}
          data-end={effective.kind}
          data-testid="stop-row"
          // A quick action: opening it must not also select the card it sits on.
          onClick={stopReactBubble}
          title={sentence}
          type="button"
        >
          <Icon
            className={cn(
              'size-3.5 shrink-0',
              (tone === 'set' || tone === 'natural') && 'text-success',
              tone === 'set' && 'fill-current'
            )}
          />
          <span className="shrink-0 font-semibold text-2xs uppercase tracking-wide opacity-80">{eyebrow}</span>
          {/* Keyed on the text so a changed condition fades in rather than switching silently. */}
          <span className="fade-in min-w-0 flex-1 animate-in truncate duration-200" key={text}>
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
  const set = isStopConditionSet(slot.condition);
  const sentence = currentBehavior(slot, effective);
  return (
    <div
      className="flex shrink-0 items-start gap-2.5 border-border border-b px-4 py-3"
      data-testid="stop-condition-section"
    >
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border',
          TONE_CLASS[tone],
          tone === 'open' && 'border-solid'
        )}
      >
        <Icon className={cn('size-3.5', tone === 'set' && 'fill-current')} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-2xs text-muted-foreground uppercase tracking-wide">Stop condition</span>
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
