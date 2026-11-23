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
  classifyIdleTimeout,
  describeStopCondition,
  idleTimeoutFires,
  isEnvRef,
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
  tryYamlOperation,
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
  /** For one its stop condition ends: the parts of the condition that act (an idle timeout may not). */
  stopsOn?: StopCondition;
  /** It hands on messages in batches, and a stop condition checks only each batch's first message. */
  batches?: boolean;
};

export type MemberCounts = { total: number; continuous: number; unknown: number; invalid: number };

type Config = Record<string, unknown>;
type EndRule = (config: Config) => InputEndBehavior;

const nonEmpty = (value: unknown) => typeof value === 'string' && value.trim() !== '';

const natural = (reason: string) => ({ kind: 'natural', reason }) satisfies InputEndBehavior;
const continuous = (reason: string, finiteHint?: string) =>
  (finiteHint ? { kind: 'continuous', reason, finiteHint } : { kind: 'continuous', reason }) satisfies InputEndBehavior;

const UNKNOWN: InputEndBehavior = {
  kind: 'unknown',
  reason: 'Whether it stops on its own isn’t known.',
};

const UNTIL_STOPPED = 'until the pipeline is stopped';

const always = (reason: string) => (() => natural(reason)) satisfies EndRule;
const never = (reason: string) => (() => continuous(reason)) satisfies EndRule;

const CONSUMES = never(`Keeps consuming new messages ${UNTIL_STOPPED}.`);
const LISTENS = never(`Listens for incoming requests ${UNTIL_STOPPED}.`);
const STREAMS_CHANGES = never(`Streams changes ${UNTIL_STOPPED}.`);
const POLLS = never(`Polls for new data ${UNTIL_STOPPED}.`);
const ROWS = always('Reads every row its query returns, then stops.');
const RECORDS = always('Reads every record its query returns, then stops.');

const snapshotOnly = (what: string) =>
  ((c) =>
    c.snapshot_mode === 'snapshot_only'
      ? natural(`Reads a snapshot of the ${what}, then stops.`)
      : continuous(
          `Streams ${what} changes ${UNTIL_STOPPED}.`,
          'Set `snapshot_mode: snapshot_only` to read a snapshot and stop.'
        )) satisfies EndRule;

const positiveInteger = (value: unknown) => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && Math.trunc(n) >= 1 ? Math.trunc(n) : undefined;
};

const envRef = (value: unknown): value is string => typeof value === 'string' && isEnvRef(value);

const dependsOn = (field: string, value: string) =>
  ({
    kind: 'unknown',
    reason: `Whether it stops depends on \`${field}\`, set from \`${value.trim()}\`.`,
  }) satisfies InputEndBehavior;

const flag = (value: unknown, fallback: boolean) =>
  value === undefined || value === null ? fallback : yamlFlag(value);

const DELETED_RE = /\bdeleted\(\s*\)/u;

function generateEnd(c: Config) {
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
  return finiteGenerateEnd(c, count);
}

function finiteGenerateEnd(c: Config, count: number) {
  const messages = count === 1 ? '1 message' : `${count} messages`;
  const interval = typeof c.interval === 'string' ? c.interval.trim() : '';
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

function httpClientEnd(c: Config) {
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

const END_RULES: Record<string, EndRule> = {
  amqp_0_9: CONSUMES,
  aws_cloudwatch_logs: never(`Tails the log groups ${UNTIL_STOPPED}.`),
  aws_dynamodb_cdc: (c) => {
    if (envRef(c.snapshot_mode)) {
      return dependsOn('snapshot_mode', c.snapshot_mode);
    }
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
  open: Set<object>;
};

function membersPhrase(n: number, total: number, [one, many]: [string, string]) {
  if (total === 1) {
    return `Its input ${one}`;
  }
  if (n === total) {
    const all = total === 2 ? 'Both' : `All ${total}`;
    return `${all} inputs ${many}`;
  }
  return `${n} of ${total} inputs ${n === 1 ? one : many}`;
}

function neverStopPhrase(n: number, total: number) {
  if (total === 1) {
    return 'Its input never stops on its own';
  }
  if (n === total) {
    return total === 2 ? 'Neither input stops on its own' : `None of its ${total} inputs stop on their own`;
  }
  return `${n} of ${total} inputs never ${n === 1 ? 'stops' : 'stop'} on ${n === 1 ? 'its' : 'their'} own`;
}

function aggregate(name: string, slots: unknown[], ctx: ClassifyContext) {
  const behaviors = slots.map((m) => classifySlot(m, ctx));
  const result: InputEndBehavior = aggregateEnd(name, behaviors);
  return behaviors.some((b) => b.batches) ? { ...result, batches: true } : result;
}

function memberCounts(behaviors: InputEndBehavior[]) {
  const count = (kind: InputEndKind) => behaviors.filter((b) => b.kind === kind).length;
  return {
    total: behaviors.length,
    continuous: count('continuous'),
    unknown: count('unknown'),
    invalid: count('invalid'),
  } satisfies MemberCounts;
}

function invalidMembersEnd(name: string, behaviors: InputEndBehavior[], members: MemberCounts) {
  const phrase = membersPhrase(members.invalid, members.total, ['needs fixing', 'need fixing']);
  const stalls = name === 'sequence' && behaviors[0].kind !== 'invalid';
  return {
    kind: 'invalid',
    reason: stalls ? `${phrase}, so the sequence stalls when it gets there.` : `${phrase}.`,
    members,
  } satisfies InputEndBehavior;
}

function continuousMembersEnd(name: string, members: MemberCounts) {
  const outcome = name === 'sequence' ? 'sequence never finishes' : 'broker keeps running';
  return {
    ...continuous(`${neverStopPhrase(members.continuous, members.total)}, so the ${outcome}.`),
    members,
  } satisfies InputEndBehavior;
}

function unknownMembersEnd(members: MemberCounts) {
  const phrase = membersPhrase(members.unknown, members.total, [
    'may not stop on its own',
    'may not stop on their own',
  ]);
  return { kind: 'unknown', reason: `${phrase}.`, members } satisfies InputEndBehavior;
}

function stoppedMembersEnd(name: string, behaviors: InputEndBehavior[], members: MemberCounts) {
  const reason =
    name === 'sequence' ? 'Stops after its last input stops.' : 'Stops once every one of its inputs has stopped.';
  const caveats = behaviors.filter((b) => b.caveat).length;
  return (
    caveats > 0
      ? {
          ...natural(reason),
          members,
          caveat: `${membersPhrase(caveats, members.total, ['might keep running', 'might keep running'])}.`,
        }
      : { ...natural(reason), members }
  ) satisfies InputEndBehavior;
}

function aggregateEnd(name: string, behaviors: InputEndBehavior[]) {
  if (behaviors.length === 0) {
    return {
      kind: 'invalid',
      reason: 'It has no inputs yet, and Connect needs at least one.',
    } satisfies InputEndBehavior;
  }
  const members = memberCounts(behaviors);
  if (members.invalid > 0) {
    return invalidMembersEnd(name, behaviors, members);
  }
  if (members.continuous > 0) {
    return continuousMembersEnd(name, members);
  }
  if (members.unknown > 0) {
    return unknownMembersEnd(members);
  }
  return stoppedMembersEnd(name, behaviors, members);
}

function inherited(inner: InputEndBehavior, reason: string) {
  return { ...inner, kind: inner.kind === 'condition' ? 'natural' : inner.kind, reason } satisfies InputEndBehavior;
}

function policyBatches(policy: unknown) {
  const p = asRecord(policy) ?? {};
  if (Number(p.count) === 1) {
    return false;
  }
  return (
    Number(p.count) > 1 ||
    Number(p.byte_size) > 0 ||
    nonEmpty(p.period) ||
    nonEmpty(p.check) ||
    (Array.isArray(p.processors) && p.processors.length > 0)
  );
}

function lastBatchWaits(policy: unknown, alwaysBatches: boolean) {
  const p = asRecord(policy) ?? {};
  if (nonEmpty(p.period) || Number(p.count) === 1) {
    return false;
  }
  return alwaysBatches || policyBatches(p);
}

function deliversBatches(name: string, config: Config) {
  if (name === 'batched' || name === 'redpanda_common' || name === 'redpanda_migrator') {
    return true;
  }
  if (name === 'generate') {
    return (positiveInteger(config.batch_size) ?? 1) > 1;
  }
  if (name === 'redpanda') {
    const unordered = asRecord(config.unordered_processing);
    return flag(unordered?.enabled, false) !== true || policyBatches(unordered?.batching);
  }
  return policyBatches(config.batching);
}

function policyError(policy: unknown, alwaysBatches: boolean, field: string) {
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
  } satisfies InputEndBehavior | undefined;
}

const waitsOnLastBatch = (field: string) =>
  ({
    kind: 'unknown',
    reason: `Its \`${field}\` has no \`period\`, so once its input ends, a last partial batch can wait forever.`,
    finiteHint: `Set \`${field}.period\` (such as 1s) so the last batch is sent.`,
  }) satisfies InputEndBehavior;

type WrapperRule = (value: Config, ctx: ClassifyContext) => InputEndBehavior | undefined;

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

type ResourceFailure = { failed: InputEndBehavior };

function resourceHop(current: unknown, chain: Set<string>, resources: Map<string, unknown>) {
  if (typeof current !== 'string') {
    return { failed: UNKNOWN } satisfies ResourceFailure;
  }
  if (chain.has(current)) {
    const loop = [...chain, current].map(code).join(' → ');
    return {
      failed: { kind: 'unknown', reason: `Its input resources refer to each other in a loop (${loop}).` },
    } satisfies ResourceFailure;
  }
  chain.add(current);
  const target = resources.get(current);
  const hop: ResourceFailure | { target: unknown } =
    target === undefined
      ? { failed: { kind: 'unknown', reason: `There’s no input resource named ${code(current)}.` } }
      : { target };
  return hop;
}

function followResources(label: unknown, resources: Map<string, unknown>) {
  const chain = new Set<string>();
  let current = label;
  for (;;) {
    const hop = resourceHop(current, chain, resources);
    if ('failed' in hop) {
      return hop;
    }
    const entry = asRecord(hop.target);
    if (!entry || slotComponentKey(entry) !== 'resource') {
      return { chain: [...chain], target: hop.target };
    }
    current = entry.resource;
  }
}

function classifyResource(label: unknown, ctx: ClassifyContext) {
  const followed = followResources(label, ctx.inputResources);
  if ('failed' in followed) {
    return followed.failed;
  }
  if (ctx.depth >= MAX_RESOURCE_DEPTH) {
    return UNKNOWN;
  }
  const resolved = classifySlot(followed.target, { ...ctx, depth: ctx.depth + 1 });
  const [first, ...through] = followed.chain;
  const via = through.length > 0 ? ` (through ${through.map(code).join(', ')})` : '';
  return inherited(resolved, `Runs the input resource ${code(first)}${via}. ${resolved.reason}`);
}

const NEVER_TRUE = new Set(['false', 'null']);

function inertStopWhy(stop: StopCondition, rereads: boolean) {
  if (rereads) {
    return {
      why: 'It reads its input again each time it finishes and never goes idle',
      hint: 'Turn off `restart_input` so it stops when it goes idle.',
    };
  }
  if (stop.check && NEVER_TRUE.has(stop.check.trim())) {
    return {
      why: `Its check ${code(stop.check.trim())} is never true`,
      hint: 'Use a check a message can meet, or add an idle timeout.',
    };
  }
  return {
    why: `Its idle timeout ${code(stop.idleTimeout?.trim() ?? '')} never fires`,
    hint: 'Use an idle timeout above zero, such as 30s.',
  };
}

function caveatFor(stop: StopCondition, inner: InputEndBehavior, { rereads, idleEnds }: StopEffects) {
  if (rereads) {
    return 'It reads its input again each time it finishes, until a message meets its check. If none does, it never stops.';
  }
  if (idleEnds || !(inner.kind === 'continuous' || inner.kind === 'unknown')) {
    return inner.caveat;
  }
  const limit = parseMessageLimit(stop.check)?.limit;
  const unit = inner.batches ? 'batches' : 'messages';
  const shortfall = limit ? `If fewer than ${limit} ${unit} arrive` : 'If no message meets its check';
  if (inner.kind === 'continuous') {
    return `${shortfall}, it keeps running. Add an idle timeout as a backstop.`;
  }
  return stop.restartInput
    ? `${shortfall}, it may keep running: \`restart_input\` reads its input again whenever it finishes.`
    : `${shortfall}, it may keep running. Add an idle timeout as a backstop.`;
}

type StopEffects = { checkEnds: boolean; idleEnds: boolean; rereads: boolean; mayReread: boolean };

function stopEffects(stop: StopCondition, inner: InputEndBehavior) {
  const restarts = Boolean(stop.restartInput);
  const rereads = restarts && (inner.kind === 'natural' || inner.kind === 'condition');
  const mayReread = restarts && inner.kind === 'unknown';
  return {
    checkEnds: Boolean(stop.check) && !NEVER_TRUE.has(stop.check?.trim() ?? ''),
    idleEnds: idleTimeoutFires(stop.idleTimeout) && !(rereads || mayReread),
    rereads,
    mayReread,
  } satisfies StopEffects;
}

function stopStartupError(stop: StopCondition) {
  if (stop.idleTimeout && classifyIdleTimeout(stop.idleTimeout) === 'invalid') {
    return {
      kind: 'invalid',
      reason: `Its idle timeout ${code(stop.idleTimeout.trim())} isn’t a duration such as 30s or 5m.`,
    } satisfies InputEndBehavior | undefined;
  }
  if (!(stop.check || isIdleTimeoutSet(stop.idleTimeout))) {
    return { kind: 'invalid', reason: 'Its stop condition needs a check or an idle timeout.' } satisfies
      | InputEndBehavior
      | undefined;
  }
}

function inertStop(stop: StopCondition, inner: InputEndBehavior, { rereads, mayReread }: StopEffects) {
  if (mayReread && idleTimeoutFires(stop.idleTimeout)) {
    return {
      kind: 'unknown',
      reason: `Its idle timeout fires only if its input never finishes: \`restart_input\` reads it again each time it does. ${inner.reason}`,
      finiteHint: inertStopWhy(stop, true).hint,
    } satisfies InputEndBehavior;
  }
  const { why, hint } = inertStopWhy(stop, rereads);
  if (rereads || inner.kind === 'continuous') {
    return continuous(`${why}, so it never stops.`, hint);
  }
  return (
    inner.kind === 'natural' || inner.kind === 'condition'
      ? { ...inner, kind: 'natural', reason: `${why}, so it stops when its input does. ${inner.reason}` }
      : { kind: 'unknown', reason: `${why}. ${inner.reason}` }
  ) satisfies InputEndBehavior;
}

function classifyStop(stop: StopCondition, inner: InputEndBehavior) {
  const startupError = stopStartupError(stop);
  if (startupError) {
    return startupError;
  }
  if (inner.kind === 'invalid') {
    return inner;
  }
  const effects = stopEffects(stop, inner);
  if (!(effects.checkEnds || effects.idleEnds)) {
    return inertStop(stop, inner, effects);
  }
  return actingStop(stop, inner, effects);
}

function actingStop(stop: StopCondition, inner: InputEndBehavior, effects: StopEffects) {
  const working: StopCondition = {
    check: effects.checkEnds ? stop.check : undefined,
    idleTimeout: effects.idleEnds ? stop.idleTimeout : undefined,
  };
  const behavior: InputEndBehavior = {
    kind: 'condition',
    reason: `Stops ${describeStopCondition(working, { batches: inner.batches }).long}.`,
    stopsOn: working,
  };
  const caveat = [caveatFor(stop, inner, effects), batchCaveat(working, inner)].filter(Boolean).join(' ');
  return caveat ? { ...behavior, caveat } : behavior;
}

const batchCaveat = (working: StopCondition, inner: InputEndBehavior) =>
  inner.batches && working.check && !parseMessageLimit(working.check)
    ? 'Its input reads in batches, and the check sees only the first message of each.'
    : undefined;

function classifyStopWithRestartRef(stop: StopCondition, inner: InputEndBehavior, ref: string) {
  const restarted = classifyStop({ ...stop, restartInput: true }, inner);
  return (
    restarted.kind === classifyStop({ ...stop, restartInput: false }, inner).kind
      ? restarted
      : dependsOn('restart_input', ref)
  ) satisfies InputEndBehavior;
}

function classifySlot(slot: unknown, ctx: ClassifyContext) {
  const record = asRecord(slot);
  if (!record) {
    return UNKNOWN;
  }
  if (ctx.open.has(record)) {
    return {
      kind: 'invalid',
      reason: 'It contains itself through a YAML alias, which Connect can’t load.',
    } satisfies InputEndBehavior;
  }
  ctx.open.add(record);
  try {
    const behavior: InputEndBehavior = classifyRecord(record, ctx);
    return behavior;
  } finally {
    ctx.open.delete(record);
  }
}

function classifyReadUntil(record: Config, component: Config, stop: StopCondition, ctx: ClassifyContext) {
  const inner = classifySlot(component, ctx);
  const restart = asRecord(record[READ_UNTIL])?.restart_input;
  const behavior = envRef(restart) ? classifyStopWithRestartRef(stop, inner, restart) : classifyStop(stop, inner);
  return (inner.batches ? { ...behavior, batches: true } : behavior) satisfies InputEndBehavior;
}

const ownRule = <T>(rules: Record<string, T>, name: string) => (Object.hasOwn(rules, name) ? rules[name] : undefined);

function classifyComponent(name: string, value: unknown, ctx: ClassifyContext) {
  if (name === READ_UNTIL) {
    return { kind: 'invalid', reason: 'Its stop condition has no input to read from.' } satisfies InputEndBehavior;
  }
  if (name === 'resource') {
    return classifyResource(value, ctx);
  }
  const config = asRecord(value) ?? {};
  const behavior = ownRule(WRAPPER_RULES, name)?.(config, ctx) ?? ownRule(END_RULES, name)?.(config) ?? UNKNOWN;
  return (deliversBatches(name, config) ? { ...behavior, batches: true } : behavior) satisfies InputEndBehavior;
}

function classifyRecord(record: Config, ctx: ClassifyContext) {
  const { component, stop } = unwrapReadUntil(record);
  if (stop) {
    return classifyReadUntil(record, component, stop, ctx);
  }
  const name = slotComponentKey(component);
  return (name ? classifyComponent(name, component[name], ctx) : UNKNOWN) satisfies InputEndBehavior;
}

function inputResourceMap(config: ParsedYamlConfig) {
  const map = new Map<string, unknown>();
  for (const item of Array.isArray(config.input_resources) ? config.input_resources : []) {
    const label = asRecord(item)?.label;
    if (typeof label === 'string' && label !== '' && !map.has(label)) {
      map.set(label, item);
    }
  }
  return map;
}

/**
 * Classify an input slot, following named resources but stopping on alias cycles.
 * A broker ends after all members end; a sequence waits for each member before
 * starting the next. A restarting `read_until` may keep its idle timer from
 * firing, and a final partial batch needs a period to flush after input ends.
 */
export function classifyInputSlot(slot: unknown, config: ParsedYamlConfig = {}) {
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
export function pipelineEndStatus(behavior: InputEndBehavior | undefined) {
  return behavior ? STATUS_BY_KIND[behavior.kind] : 'none';
}

/**
 * Whether a pipeline ends by itself: it does when its top-level input does. A finished Cloud pipeline
 * is stopped automatically, so `finite` is the gate for running it on a schedule.
 */
export function summarizePipelineEnd(config: ParsedYamlConfig | null | undefined) {
  const input = asRecord(config?.input);
  if (!(config && input && slotComponentKey(input))) {
    return { status: 'none' } satisfies PipelineEndSummary;
  }
  const behavior = classifyInputSlot(input, config);
  return { status: pipelineEndStatus(behavior), behavior } satisfies PipelineEndSummary;
}

/** {@link summarizePipelineEnd} from config text; undefined for YAML that doesn't parse. */
export function readPipelineEnd(configYaml: string) {
  return tryYamlOperation(() =>
    summarizePipelineEnd(parseYaml(configYaml, { merge: true }) as ParsedYamlConfig | null)
  );
}

/** {@link readPipelineEnd}, with unparseable YAML answered as having no input (`none`). */
export function summarizePipelineEndYaml(configYaml: string) {
  return (readPipelineEnd(configYaml) ?? { status: 'none' }) satisfies PipelineEndSummary;
}
