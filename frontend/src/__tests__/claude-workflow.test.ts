import { parse } from 'yaml';
import { z } from 'zod';

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflowPath = fileURLToPath(new URL('../../../.github/workflows/claude.yml', import.meta.url));

const workflowSchema = z.object({
  jobs: z.object({
    claude: z.object({
      steps: z.array(
        z.object({
          uses: z.string().optional(),
          with: z.record(z.string(), z.unknown()).optional(),
          env: z.record(z.string(), z.unknown()).optional(),
        })
      ),
    }),
  }),
});

const readClaudeCodeActionStep = () => {
  const workflow = workflowSchema.parse(parse(readFileSync(workflowPath, 'utf8')));
  const actionStep = workflow.jobs.claude.steps.find(
    (step) => step.uses?.startsWith('anthropics/claude-code-action@') === true
  );

  if (!actionStep) {
    throw new Error('Claude Code Action step missing');
  }

  return actionStep;
};

describe('the Claude Code workflow', () => {
  test('passes the workflow token as an action input', () => {
    const actionStep = readClaudeCodeActionStep();

    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal external configuration syntax, not JavaScript interpolation.
    expect(actionStep.with?.github_token).toBe('${{ github.token }}');
  });
});
