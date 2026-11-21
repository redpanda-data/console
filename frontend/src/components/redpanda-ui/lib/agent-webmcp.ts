import { agentTools, type AgentStep } from '@ui-sdk/react/agent';
import type { StagedChange } from '@ui-sdk/react/history';

import { ConsoleAgentError, type ConsoleAgentSession, type HistoryCommand } from './agent-session';

type NativeTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: true };
  execute: (input: unknown, context?: { signal?: AbortSignal }) => Promise<unknown>;
};
type NativeHost = { registerTool: (tool: NativeTool, options: { signal: AbortSignal }) => Promise<void> };
const commands = new Set<HistoryCommand>(['undo-agent', 'seek', 'revert', 'accept', 'clear']);
const fields = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ConsoleAgentError('Provide an input object.');
  return input as Record<string, unknown>;
};
const text = (value: unknown) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 500)
    throw new ConsoleAgentError('Use a string of at most 500 characters.');
  return value;
};
function steps(input: unknown): AgentStep[] {
  const items = fields(input).steps;
  if (!Array.isArray(items) || !items.length || items.length > 20)
    throw new ConsoleAgentError('Provide 1 to 20 steps.');
  return items.map((item) => {
    const entry = fields(item);
    const ref = text(entry.ref);
    const action = text(entry.action);
    if (!ref || !action || (entry.args !== undefined && !Array.isArray(entry.args)))
      throw new ConsoleAgentError('Each step needs a ref, action and optional args array.');
    return { ref, action, args: entry.args };
  });
}
function changes(input: unknown): StagedChange[] {
  const items = fields(input).changes;
  if (!Array.isArray(items) || !items.length || items.length > 20)
    throw new ConsoleAgentError('Provide 1 to 20 changes.');
  return items.map((item) => {
    const entry = fields(item);
    const ref = text(entry.ref);
    if (!ref || !('value' in entry))
      throw new ConsoleAgentError('Each change needs a current component ref and value.');
    return { ref, key: text(entry.key), value: entry.value };
  });
}
const objectSchema = (properties: object, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export async function registerConsoleTools(
  session: ConsoleAgentSession,
  options: {
    document: Document;
    signal: AbortSignal;
    cancelApproval: () => void;
  }
) {
  const host = (options.document as Document & { modelContext?: NativeHost }).modelContext;
  if (typeof host?.registerTool !== 'function') return 'unsupported' as const;
  const definitions: Pick<NativeTool, 'name' | 'description' | 'inputSchema'>[] = agentTools.map((tool) => ({
    ...tool,
    name: `console_${tool.name}`,
  }));
  definitions.push(
    {
      name: 'console_changes',
      description:
        'Read Console activity source/reason and local-draft history metadata. No field values or network rollback.',
      inputSchema: objectSchema({}),
    },
    {
      name: 'console_stage',
      description:
        'Try 1–20 non-secret field values in the current opt-in local draft. Each write needs human approval. Does not submit or publish the draft. Read state to verify acceptance.',
      inputSchema: objectSchema(
        {
          changes: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: objectSchema(
              { ref: { type: 'string' }, key: { type: 'string', enum: ['value', 'checked', 'pressed'] }, value: {} },
              ['ref', 'value']
            ),
          },
        },
        ['changes']
      ),
    },
    {
      name: 'console_history',
      description:
        'Seek local-draft values, undo agent edits, discard or keep a staged suggestion, or forget history. Restored fields still require human approval. Never reverses a save or network request; redacted/unavailable/newer values may be kept.',
      inputSchema: objectSchema(
        { command: { type: 'string', enum: [...commands] }, position: { type: 'integer', minimum: 0 } },
        ['command']
      ),
    }
  );
  let mutating = false;
  const execute = async (name: string, input: unknown) => {
    const data = fields(input);
    if (name === 'console_snapshot') return session.snapshot();
    if (name === 'console_query')
      return session.query({ text: text(data.text), within: text(data.within), kind: text(data.kind) });
    if (name === 'console_act') return session.act({ steps: steps(input) });
    if (name === 'console_changes') return session.getState();
    if (name === 'console_stage') return session.stage(changes(input));
    const command = text(data.command) as HistoryCommand;
    if (!commands.has(command) || (data.position !== undefined && typeof data.position !== 'number'))
      throw new ConsoleAgentError('Choose a valid history command and integer position.');
    return session.restore(command, data.position as number | undefined, true);
  };
  // Namespacing and output scoping are not options of beta.2's registerTools helper.
  for (const definition of definitions) {
    options.signal.throwIfAborted();
    await host.registerTool(
      {
        ...definition,
        annotations: {
          readOnlyHint: ['console_snapshot', 'console_query', 'console_changes'].includes(definition.name),
          untrustedContentHint: true,
        },
        execute: async (input, context) => {
          const signal = context?.signal;
          const writes = !['console_snapshot', 'console_query', 'console_changes'].includes(definition.name);
          let release: (() => void) | undefined;
          const cancel = () => options.cancelApproval();
          try {
            options.signal.throwIfAborted();
            signal?.throwIfAborted();
            if (writes) {
              if (mutating) throw new ConsoleAgentError('Another agent operation is awaiting approval or completion.');
              release = session.acquireNativeCall(AbortSignal.any([options.signal, ...(signal ? [signal] : [])]));
              mutating = true;
              signal?.addEventListener('abort', cancel, { once: true });
            }
            const result = await execute(definition.name, input);
            options.signal.throwIfAborted();
            signal?.throwIfAborted();
            return result;
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    code: signal?.aborted || options.signal.aborted ? 'CANCELLED' : 'CONSOLE_AGENT_ERROR',
                    message:
                      signal?.aborted || options.signal.aborted
                        ? 'Call cancelled. Check current state before retrying.'
                        : error instanceof ConsoleAgentError
                          ? error.message
                          : 'Call failed. Check current state before retrying.',
                  }),
                },
              ],
            };
          } finally {
            if (release) {
              mutating = false;
              release();
              signal?.removeEventListener('abort', cancel);
            }
          }
        },
      },
      { signal: options.signal }
    );
  }
  return 'active' as const;
}
