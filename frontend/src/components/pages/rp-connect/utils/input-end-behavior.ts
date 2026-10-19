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

import { parse as parseYaml } from 'yaml';

import {
  describeStopCondition,
  idleTimeoutFires,
  isEnvRef,
  isIdleTimeoutParseable,
  isIdleTimeoutSet,
  parseGoDuration,
  parseMessageLimit,
} from './read-until';
import {
  asRecord,
  type ParsedYamlConfig,
  READ_UNTIL,
  type StopCondition,
  slotComponentKey,
  unwrapReadUntil,
  yamlFlag,
} from './yaml';

/**
 * How an input ends. `condition`: a `read_until` stop condition; `natural`: it stops once its data
 * runs out; `continuous`: it runs until the pipeline is stopped; `invalid`: a `read_until` with
 * nothing to stop on; `unknown`: it can't be told from the config.
 */
export type InputEndKind = 'condition' | 'natural' | 'continuous' | 'invalid' | 'unknown';

export type InputEndBehavior = {
  kind: InputEndKind;
  /** Why, as a sentence about the input ("Reads every object in the bucket, then stops."). */
  reason: string;
  /** For an input that keeps running only because of how it's configured: the change that makes it end. */
  finiteHint?: string;
  /** For a broker/sequence: how many members there are, and how many of them can't be relied on to end. */
  members?: MemberCounts;
  /** For an input that ends, what can still keep it running (a check no message meets, a cron wait). */
  caveat?: string;
};

export type MemberCounts = { total: number; continuous: number; unknown: number; invalid: number };

type Config = Record<string, unknown>;
type EndRule = (config: Config) => InputEndBehavior;

const nonEmpty = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

const natural = (reason: string): InputEndBehavior => ({ kind: 'natural', reason });
const continuous = (reason: string, finiteHint?: string): InputEndBehavior =>
  finiteHint ? { kind: 'continuous', reason, finiteHint } : { kind: 'continuous', reason };

const UNKNOWN: InputEndBehavior = {
  kind: 'unknown',
  reason: 'Whether it stops on its own isn’t known.',
};

const UNTIL_STOPPED = 'until the pipeline is stopped';

const always =
  (reason: string): EndRule =>
  () =>
    natural(reason);
const never =
  (reason: string): EndRule =>
  () =>
    continuous(reason);

const CONSUMES = never(`Keeps consuming new messages ${UNTIL_STOPPED}.`);
const LISTENS = never(`Listens for incoming requests ${UNTIL_STOPPED}.`);
const STREAMS_CHANGES = never(`Streams changes ${UNTIL_STOPPED}.`);
const POLLS = never(`Polls for new data ${UNTIL_STOPPED}.`);
const ROWS = always('Reads every row its query returns, then stops.');
const RECORDS = always('Reads every record its query returns, then stops.');

// A CDC input that can read a one-off snapshot instead of streaming.
const snapshotOnly =
  (what: string): EndRule =>
  (c) =>
    c.snapshot_mode === 'snapshot_only'
      ? natural(`Reads a snapshot of the ${what}, then stops.`)
      : continuous(
          `Streams ${what} changes ${UNTIL_STOPPED}.`,
          'Set `snapshot_mode: snapshot_only` to read a snapshot and stop.'
        );

// Connect truncates an int field, so `count: 0.5` is 0 (unlimited).
const positiveInteger = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && Math.trunc(n) >= 1 ? Math.trunc(n) : undefined;
};

const envRef = (value: unknown): value is string => typeof value === 'string' && isEnvRef(value);

const dependsOn = (field: string, value: string): InputEndBehavior => ({
  kind: 'unknown',
  reason: `Whether it stops depends on \`${field}\`, set from \`${value.trim()}\`.`,
});

// A boolean field with its default when unset; undefined when only the runtime can tell (an env var).
const flag = (value: unknown, fallback: boolean): boolean | undefined =>
  value === undefined || value === null ? fallback : yamlFlag(value);

const DELETED_RE = /\bdeleted\(\s*\)/;

function generateEnd(c: Config): InputEndBehavior {
  if (envRef(c.count)) {
    return dependsOn('count', c.count);
  }
  const count = positiveInteger(c.count);
  if (!count) {
    const hint =
      c.count === undefined
        ? 'Set `count` to stop after a fixed number of messages.'
        : 'Set `count` to 1 or more to stop after that many messages.';
    return continuous(`Generates messages ${UNTIL_STOPPED}.`, hint);
  }
  const messages = count === 1 ? '1 message' : `${count} messages`;
  const interval = typeof c.interval === 'string' ? c.interval.trim() : '';
  // An interval that isn't a duration is a cron expression: nothing is generated before its first tick.
  const cron = interval !== '' && parseGoDuration(interval) === undefined && !isEnvRef(interval);
  const caveats = [
    cron ? `Each run waits for the next \`${interval}\` tick before its first message.` : undefined,
    typeof c.mapping === 'string' && DELETED_RE.test(c.mapping)
      ? 'Messages its mapping deletes don’t count toward `count`.'
      : undefined,
  ].filter(Boolean);
  const behavior = natural(
    cron ? `Generates ${messages} on its \`${interval}\` schedule, then stops.` : `Generates ${messages}, then stops.`
  );
  return caveats.length > 0 ? { ...behavior, caveat: caveats.join(' ') } : behavior;
}

function httpClientEnd(c: Config): InputEndBehavior {
  const stream = asRecord(c.stream);
  const enabled = flag(stream?.enabled, false);
  if (enabled === undefined) {
    return dependsOn('stream.enabled', String(stream?.enabled));
  }
  if (!enabled) {
    return continuous(`Polls the URL ${UNTIL_STOPPED}.`);
  }
  const reconnect = flag(stream?.reconnect, true);
  if (reconnect === undefined) {
    return dependsOn('stream.reconnect', String(stream?.reconnect));
  }
  return reconnect
    ? continuous(
        `Reconnects whenever the stream closes, ${UNTIL_STOPPED}.`,
        'Set `stream.reconnect: false` to stop when the stream ends.'
      )
    : natural('Reads the response stream, then stops when the server closes it.');
}

// Per Redpanda Connect 4.100: which inputs return end-of-input, and under what config. Components
// missing here are `unknown`; composites (broker, sequence, resource, read_until) are handled below.
const END_RULES: Record<string, EndRule> = {
  amqp_0_9: CONSUMES,
  aws_cloudwatch_logs: never(`Tails the log groups ${UNTIL_STOPPED}.`),
  aws_dynamodb_cdc: (c) => {
    if (envRef(c.snapshot_mode)) {
      return dependsOn('snapshot_mode', c.snapshot_mode);
    }
    // Any snapshot is refused with tag discovery or several tables, so snapshot_only isn't offered there.
    const multiTable = c.table_discovery_mode === 'tag' || (Array.isArray(c.tables) && c.tables.length > 1);
    const mode = typeof c.snapshot_mode === 'string' ? c.snapshot_mode : 'none';
    if (multiTable && mode !== 'none') {
      return {
        kind: 'invalid',
        reason: `Connect refuses \`snapshot_mode: ${mode}\` with tag discovery or more than one table.`,
      };
    }
    if (mode === 'snapshot_only') {
      return natural('Reads a snapshot of the table, then stops.');
    }
    return continuous(
      `Streams table changes ${UNTIL_STOPPED}.`,
      multiTable ? undefined : 'Set `snapshot_mode: snapshot_only` to read a snapshot and stop.'
    );
  },
  aws_kinesis: CONSUMES,
  aws_s3: (c) =>
    nonEmpty(asRecord(c.sqs)?.url)
      ? continuous(
          `Follows SQS notifications for new objects ${UNTIL_STOPPED}.`,
          'Clear `sqs.url` to read the bucket once and stop.'
        )
      : natural('Reads every object in the bucket, then stops.'),
  aws_sqs: CONSUMES,
  // With `targets_input`, it follows that input instead (see classifySlot).
  azure_blob_storage: always('Reads every blob in the container, then stops.'),
  azure_cosmosdb: RECORDS,
  azure_queue_storage: CONSUMES,
  azure_table_storage: always('Reads every entity in the table, then stops.'),
  gateway: LISTENS,
  gcp_bigquery_select: ROWS,
  gcp_cloud_storage: always('Reads every object in the bucket, then stops.'),
  gcp_pubsub: CONSUMES,
  gcp_spanner_cdc: STREAMS_CHANGES,
  generate: generateEnd,
  git: POLLS,
  http_client: httpClientEnd,
  http_server: LISTENS,
  inproc: never(`Reads from another pipeline’s stream ${UNTIL_STOPPED}.`),
  jira: POLLS,
  kafka: CONSUMES,
  kafka_franz: CONSUMES,
  microsoft_sql_server_cdc: STREAMS_CHANGES,
  mongodb: always('Reads every document its query returns, then stops.'),
  mongodb_cdc: STREAMS_CHANGES,
  mqtt: CONSUMES,
  mysql_cdc: STREAMS_CHANGES,
  nats: CONSUMES,
  nats_jetstream: CONSUMES,
  nats_kv: never(`Watches the bucket for changes ${UNTIL_STOPPED}.`),
  oracledb_cdc: snapshotOnly('database'),
  otlp_grpc: LISTENS,
  otlp_http: LISTENS,
  pg_stream: STREAMS_CHANGES,
  postgres_cdc: STREAMS_CHANGES,
  redis_list: CONSUMES,
  redis_pubsub: CONSUMES,
  redis_scan: always('Reads every matching key, then stops.'),
  redis_streams: CONSUMES,
  redpanda: CONSUMES,
  redpanda_common: CONSUMES,
  redpanda_migrator: CONSUMES,
  salesforce: RECORDS,
  salesforce_cdc: STREAMS_CHANGES,
  salesforce_graphql: RECORDS,
  schema_registry: always('Reads every schema in the registry, then stops.'),
  sftp: (c) => {
    const watcher = asRecord(c.watcher)?.enabled;
    const watching = flag(watcher, false);
    if (watching === undefined) {
      return dependsOn('watcher.enabled', String(watcher));
    }
    return watching
      ? continuous(`Watches for new files ${UNTIL_STOPPED}.`, 'Turn off `watcher` to read the files once and stop.')
      : natural('Reads every matching file, then stops.');
  },
  slack: never(`Listens for Slack events ${UNTIL_STOPPED}.`),
  slack_users: always('Reads every user in the workspace, then stops.'),
  spicedb_watch: STREAMS_CHANGES,
  splunk: always('Reads the search results, then stops.'),
  sql_raw: ROWS,
  sql_select: ROWS,
  timeplus: never(`Re-runs its query ${UNTIL_STOPPED}.`),
  // Self-hosted only, kept so a shared config classifies the same.
  csv: always('Reads every row in the files, then stops.'),
  file: always('Reads every file to the end, then stops.'),
  stdin: always('Reads until its input closes, then stops.'),
  subprocess: (c) => {
    const restarts = flag(c.restart_on_exit, false);
    if (restarts === undefined) {
      return dependsOn('restart_on_exit', String(c.restart_on_exit));
    }
    return restarts
      ? continuous(
          `Restarts the process whenever it exits, ${UNTIL_STOPPED}.`,
          'Turn off `restart_on_exit` to stop when the process exits.'
        )
      : natural('Stops when the process exits.');
  },
  tigerbeetle_cdc: STREAMS_CHANGES,
};

const MAX_RESOURCE_DEPTH = 4;

type ClassifyContext = {
  inputResources: Map<string, unknown>;
  depth: number;
  /** The slots being classified, outermost first: an alias back to one of them is a loop. */
  open: Set<object>;
};

// "Its input has" / "Both inputs have" / "2 of 3 inputs have": which members `verb` applies to.
function membersPhrase(n: number, total: number, [one, many]: [string, string]): string {
  if (total === 1) {
    return `Its input ${one}`;
  }
  if (n === total) {
    return `${total === 2 ? 'Both' : `All ${total}`} inputs ${many}`;
  }
  return `${n} of ${total} inputs ${n === 1 ? one : many}`;
}

// The members that never stop, with the negation folded in when it's all of them.
function neverStopPhrase(n: number, total: number): string {
  if (total === 1) {
    return 'Its input never stops on its own';
  }
  if (n === total) {
    return total === 2 ? 'Neither input stops on its own' : `None of its ${total} inputs stop on their own`;
  }
  return `${n} of ${total} inputs never ${n === 1 ? 'stops' : 'stop'} on ${n === 1 ? 'its' : 'their'} own`;
}

// A broker ends once every member has; a sequence moves to the next member only when one ends.
function aggregate(name: string, slots: unknown[], ctx: ClassifyContext): InputEndBehavior {
  const behaviors = slots.map((m) => classifySlot(m, ctx));
  const total = behaviors.length;
  if (total === 0) {
    return { kind: 'invalid', reason: 'It has no inputs yet, and Connect needs at least one.' };
  }
  const count = (kind: InputEndKind) => behaviors.filter((b) => b.kind === kind).length;
  const members: MemberCounts = {
    total,
    continuous: count('continuous'),
    unknown: count('unknown'),
    invalid: count('invalid'),
  };
  if (members.invalid > 0) {
    const phrase = membersPhrase(members.invalid, total, ['needs fixing', 'need fixing']);
    // A sequence builds only its first input at start; a broken later one stalls it, retrying forever.
    const stalls = name === 'sequence' && behaviors[0].kind !== 'invalid';
    return {
      kind: 'invalid',
      reason: stalls ? `${phrase}, so the sequence stalls when it gets there.` : `${phrase}.`,
      members,
    };
  }
  if (members.continuous > 0) {
    const outcome = name === 'sequence' ? 'sequence never finishes' : 'broker keeps running';
    return { ...continuous(`${neverStopPhrase(members.continuous, total)}, so the ${outcome}.`), members };
  }
  if (members.unknown > 0) {
    const phrase = membersPhrase(members.unknown, total, ['may not stop on its own', 'may not stop on their own']);
    return { kind: 'unknown', reason: `${phrase}.`, members };
  }
  const reason =
    name === 'sequence' ? 'Stops after its last input stops.' : 'Stops once every one of its inputs has stopped.';
  const caveats = behaviors.filter((b) => b.caveat).length;
  return caveats > 0
    ? {
        ...natural(reason),
        members,
        caveat: `${membersPhrase(caveats, total, ['might keep running', 'might keep running'])}.`,
      }
    : { ...natural(reason), members };
}

// A wrapper that runs another input ends as that input does; its stop condition isn't the wrapper's own.
function inherited(inner: InputEndBehavior, reason: string): InputEndBehavior {
  return { ...inner, kind: inner.kind === 'condition' ? 'natural' : inner.kind, reason };
}

// Connect sends a last partial batch only on a `period` timer: once the input ends, any other policy
// waits on it forever. `batched` always batches; a broker skips batching when the policy sets nothing.
function lastBatchWaits(policy: unknown, alwaysBatches: boolean): boolean {
  const p = asRecord(policy) ?? {};
  if (nonEmpty(p.period) || Number(p.count) === 1) {
    return false;
  }
  const batches =
    Number(p.count) > 1 ||
    Number(p.byte_size) > 0 ||
    nonEmpty(p.check) ||
    (Array.isArray(p.processors) && p.processors.length > 0);
  return alwaysBatches || batches;
}

// Connect refuses a policy with nothing to send a batch on; a broker skips one that sets nothing at all.
function policyError(policy: unknown, alwaysBatches: boolean, field: string): InputEndBehavior | undefined {
  const p = asRecord(policy) ?? {};
  const triggered =
    Number(p.count) > 0 ||
    Number(p.byte_size) > 0 ||
    envRef(p.count) ||
    envRef(p.byte_size) ||
    nonEmpty(p.period) ||
    nonEmpty(p.check);
  const processors = Array.isArray(p.processors) && p.processors.length > 0;
  if (triggered || !(alwaysBatches || processors)) {
    return;
  }
  return {
    kind: 'invalid',
    reason: `Its \`${field}\` has no \`count\`, \`byte_size\`, \`period\` or \`check\` to send a batch on, so Connect refuses it.`,
  };
}

const waitsOnLastBatch = (field: string): InputEndBehavior => ({
  kind: 'unknown',
  reason: `Its \`${field}\` has no \`period\`, so once its input ends, a last partial batch can wait forever.`,
  finiteHint: `Set \`${field}.period\` (such as 1s) so the last batch is sent.`,
});

type WrapperRule = (value: Config, ctx: ClassifyContext) => InputEndBehavior | undefined;

// Inputs that run other inputs end as those do; `undefined` falls through to END_RULES.
const WRAPPER_RULES: Record<string, WrapperRule> = {
  broker: (value, ctx) => {
    const result = aggregate('broker', Array.isArray(value.inputs) ? value.inputs : [], ctx);
    const refused = result.kind === 'invalid' ? undefined : policyError(value.batching, false, 'batching');
    if (refused) {
      return { ...refused, members: result.members };
    }
    return result.kind === 'natural' && lastBatchWaits(value.batching, false)
      ? { ...waitsOnLastBatch('batching'), members: result.members }
      : result;
  },
  sequence: (value, ctx) => aggregate('sequence', Array.isArray(value.inputs) ? value.inputs : [], ctx),
  batched: (value, ctx) => {
    const refused = policyError(value.policy, true, 'policy');
    if (refused) {
      return refused;
    }
    const child = classifySlot(value.child, ctx);
    const result = inherited(child, `Batches its child input. ${child.reason}`);
    return result.kind === 'natural' && lastBatchWaits(value.policy, true) ? waitsOnLastBatch('policy') : result;
  },
  azure_blob_storage: (value, ctx) => {
    if (!asRecord(value.targets_input)) {
      return;
    }
    const targets = classifySlot(value.targets_input, ctx);
    return targets.kind === 'continuous'
      ? continuous(
          `Follows its targets input for new blobs ${UNTIL_STOPPED}.`,
          'Remove `targets_input` to read the container once and stop.'
        )
      : inherited(targets, 'Reads the blobs its targets input names, then stops once that input does.');
  },
};

const code = (text: string) => `\`${text}\``;

// `resource: <label>` runs an `input_resources` entry; a chain of plain references is followed to its end.
function classifyResource(label: unknown, ctx: ClassifyContext): InputEndBehavior {
  const chain: string[] = [];
  let current = label;
  let target: unknown;
  for (;;) {
    if (typeof current !== 'string') {
      return UNKNOWN;
    }
    if (chain.includes(current)) {
      return {
        kind: 'unknown',
        reason: `Its input resources refer to each other in a loop (${[...chain, current].map(code).join(' → ')}).`,
      };
    }
    chain.push(current);
    target = ctx.inputResources.get(current);
    if (target === undefined) {
      return { kind: 'unknown', reason: `There’s no input resource named ${code(current)}.` };
    }
    const entry = asRecord(target);
    if (!entry || slotComponentKey(entry) !== 'resource') {
      break;
    }
    current = entry.resource;
  }
  if (ctx.depth >= MAX_RESOURCE_DEPTH) {
    return UNKNOWN;
  }
  const resolved = classifySlot(target, { ...ctx, depth: ctx.depth + 1 });
  const via = chain.length > 1 ? ` (through ${chain.slice(1).map(code).join(', ')})` : '';
  return inherited(resolved, `Runs the input resource ${code(chain[0])}${via}. ${resolved.reason}`);
}

// Checks Connect can never pass.
const NEVER_TRUE = new Set(['false', 'null']);

// Why the wrapper itself can't end its input, as the start of a sentence.
function inertStopReason(stop: StopCondition, rereads: boolean): string {
  if (rereads) {
    return 'It reads its input again each time it finishes and never goes idle';
  }
  if (stop.check && NEVER_TRUE.has(stop.check.trim())) {
    return `Its check ${code(stop.check.trim())} is never true`;
  }
  return `Its idle timeout ${code(stop.idleTimeout?.trim() ?? '')} never fires`;
}

function caveatFor(
  stop: StopCondition,
  inner: InputEndBehavior,
  { rereads, idleEnds }: StopEffects
): string | undefined {
  if (rereads) {
    return 'It reads its input again each time it finishes, until a message meets its check. If none does, it never stops.';
  }
  if (idleEnds || !(inner.kind === 'continuous' || inner.kind === 'unknown')) {
    return inner.caveat;
  }
  const limit = parseMessageLimit(stop.check)?.limit;
  const shortfall = limit ? `If fewer than ${limit} messages arrive` : 'If no message meets its check';
  if (inner.kind === 'continuous') {
    return `${shortfall}, it keeps running. Add an idle timeout as a backstop.`;
  }
  // Its input may never end; with `restart_input`, an idle timeout may never fire either.
  return stop.restartInput
    ? `${shortfall}, it may keep running: \`restart_input\` reads its input again whenever it finishes.`
    : `${shortfall}, it may keep running. Add an idle timeout as a backstop.`;
}

type StopEffects = { checkEnds: boolean; idleEnds: boolean; rereads: boolean; mayReread: boolean };

function stopEffects(stop: StopCondition, inner: InputEndBehavior): StopEffects {
  const restarts = Boolean(stop.restartInput);
  const rereads = restarts && (inner.kind === 'natural' || inner.kind === 'condition');
  // An input that may or may not end may or may not be read again, so its idle timeout can't be relied on.
  const mayReread = restarts && inner.kind === 'unknown';
  return {
    checkEnds: Boolean(stop.check) && !NEVER_TRUE.has(stop.check?.trim() ?? ''),
    idleEnds: idleTimeoutFires(stop.idleTimeout) && !(rereads || mayReread),
    rereads,
    mayReread,
  };
}

// Connect's own start-up errors: an unparseable timeout, or nothing to stop on.
function stopStartupError(stop: StopCondition): InputEndBehavior | undefined {
  if (stop.idleTimeout && !isIdleTimeoutParseable(stop.idleTimeout)) {
    return {
      kind: 'invalid',
      reason: `Its idle timeout ${code(stop.idleTimeout.trim())} isn’t a duration such as 30s or 5m.`,
    };
  }
  if (!(stop.check || isIdleTimeoutSet(stop.idleTimeout))) {
    return { kind: 'invalid', reason: 'Its stop condition needs a check or an idle timeout.' };
  }
}

// The change that lets a stop condition that never acts end its input.
function inertStopHint(stop: StopCondition, rereads: boolean): string {
  if (rereads) {
    return 'Turn off `restart_input` so it stops when it goes idle.';
  }
  return stop.check && NEVER_TRUE.has(stop.check.trim())
    ? 'Use a check a message can meet, or add an idle timeout.'
    : 'Use an idle timeout above zero, such as 30s.';
}

// A wrapper that never ends its input leaves it to end, or not, as it would bare.
function inertStop(
  stop: StopCondition,
  inner: InputEndBehavior,
  { rereads, mayReread }: StopEffects
): InputEndBehavior {
  if (mayReread && idleTimeoutFires(stop.idleTimeout)) {
    return {
      kind: 'unknown',
      reason: `Its idle timeout fires only if its input never finishes: \`restart_input\` reads it again each time it does. ${inner.reason}`,
      finiteHint: inertStopHint(stop, true),
    };
  }
  const why = inertStopReason(stop, rereads);
  if (rereads || inner.kind === 'continuous') {
    return continuous(`${why}, so it never stops.`, inertStopHint(stop, rereads));
  }
  return inner.kind === 'natural'
    ? { ...inner, reason: `${why}, so it stops when its input does. ${inner.reason}` }
    : { kind: 'unknown', reason: `${why}. ${inner.reason}` };
}

/**
 * A `read_until` ends its input on a check that passes or an idle timeout that fires. With
 * `restart_input`, an input that ends is read again straight away, so the idle timer never runs out.
 */
function classifyStop(stop: StopCondition, inner: InputEndBehavior): InputEndBehavior {
  const startupError = stopStartupError(stop);
  if (startupError) {
    return startupError;
  }
  // A broken input inside still fails the pipeline, whatever stops it.
  if (inner.kind === 'invalid') {
    return inner;
  }
  const effects = stopEffects(stop, inner);
  if (!(effects.checkEnds || effects.idleEnds)) {
    return inertStop(stop, inner, effects);
  }
  const working: StopCondition = {
    check: effects.checkEnds ? stop.check : undefined,
    idleTimeout: effects.idleEnds ? stop.idleTimeout : undefined,
  };
  const behavior: InputEndBehavior = { kind: 'condition', reason: `Stops ${describeStopCondition(working).long}.` };
  const caveat = caveatFor(stop, inner, effects);
  return caveat ? { ...behavior, caveat } : behavior;
}

// A `restart_input` set from an env var: known only when it ends the same way either way.
function classifyStopWithRestartRef(stop: StopCondition, inner: InputEndBehavior, ref: string): InputEndBehavior {
  const restarted = classifyStop({ ...stop, restartInput: true }, inner);
  return restarted.kind === classifyStop({ ...stop, restartInput: false }, inner).kind
    ? restarted
    : dependsOn('restart_input', ref);
}

function classifySlot(slot: unknown, ctx: ClassifyContext): InputEndBehavior {
  const record = asRecord(slot);
  if (!record) {
    return UNKNOWN;
  }
  if (ctx.open.has(record)) {
    return { kind: 'invalid', reason: 'It contains itself through a YAML alias, which Connect can’t load.' };
  }
  ctx.open.add(record);
  try {
    return classifyRecord(record, ctx);
  } finally {
    ctx.open.delete(record);
  }
}

function classifyRecord(record: Config, ctx: ClassifyContext): InputEndBehavior {
  const { component, stop } = unwrapReadUntil(record);
  if (stop) {
    const inner = classifySlot(component, ctx);
    const restart = asRecord(record[READ_UNTIL])?.restart_input;
    return envRef(restart) ? classifyStopWithRestartRef(stop, inner, restart) : classifyStop(stop, inner);
  }
  const name = slotComponentKey(component);
  if (!name) {
    return UNKNOWN;
  }
  const value = component[name];
  if (name === READ_UNTIL) {
    return { kind: 'invalid', reason: 'Its stop condition has no input to read from.' };
  }
  if (name === 'resource') {
    return classifyResource(value, ctx);
  }
  const config = asRecord(value) ?? {};
  const wrapped = WRAPPER_RULES[name]?.(config, ctx);
  if (wrapped) {
    return wrapped;
  }
  const rule = END_RULES[name];
  return rule ? rule(config) : UNKNOWN;
}

function inputResourceMap(config: ParsedYamlConfig): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const item of Array.isArray(config.input_resources) ? config.input_resources : []) {
    const label = asRecord(item)?.label;
    if (typeof label === 'string' && label !== '' && !map.has(label)) {
      map.set(label, item);
    }
  }
  return map;
}

/** How the input held by `slot` (an object like `{ kafka: {…} }`) ends, resolving `resource:` references. */
export function classifyInputSlot(slot: unknown, config: ParsedYamlConfig = {}): InputEndBehavior {
  return classifySlot(slot, { inputResources: inputResourceMap(config), depth: 0, open: new Set() });
}

/** The pipeline-level answer: does it stop on its own once its input(s) are done? */
export type PipelineEndStatus = 'finite' | 'continuous' | 'invalid' | 'unknown' | 'none';

export type PipelineEndSummary = {
  status: PipelineEndStatus;
  /** The top-level input's behavior (a broker/sequence aggregates its members). */
  behavior?: InputEndBehavior;
};

const STATUS_BY_KIND: Record<InputEndKind, PipelineEndStatus> = {
  condition: 'finite',
  natural: 'finite',
  continuous: 'continuous',
  invalid: 'invalid',
  unknown: 'unknown',
};

/** The pipeline's status from its top-level input's behavior (`none` without an input). */
export function pipelineEndStatus(behavior: InputEndBehavior | undefined): PipelineEndStatus {
  return behavior ? STATUS_BY_KIND[behavior.kind] : 'none';
}

/**
 * Whether a pipeline ends by itself: it does when its top-level input does. A finished Cloud pipeline
 * is stopped automatically, so `finite` is the gate for running it on a schedule.
 */
export function summarizePipelineEnd(config: ParsedYamlConfig | null | undefined): PipelineEndSummary {
  const input = asRecord(config?.input);
  if (!(config && input && slotComponentKey(input))) {
    return { status: 'none' };
  }
  const behavior = classifyInputSlot(input, config);
  return { status: pipelineEndStatus(behavior), behavior };
}

/** {@link summarizePipelineEnd} from config text; undefined for YAML that doesn't parse. */
export function readPipelineEnd(configYaml: string): PipelineEndSummary | undefined {
  try {
    return summarizePipelineEnd(parseYaml(configYaml, { merge: true }) as ParsedYamlConfig | null);
  } catch {}
}

/** {@link readPipelineEnd}, with unparseable YAML answered as having no input (`none`). */
export function summarizePipelineEndYaml(configYaml: string): PipelineEndSummary {
  return readPipelineEnd(configYaml) ?? { status: 'none' };
}
