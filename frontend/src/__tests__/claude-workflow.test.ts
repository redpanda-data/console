import { parse } from 'yaml';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflowPath = fileURLToPath(new URL('../../../.github/workflows/claude.yml', import.meta.url));

type WorkflowStep = {
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
};

type Workflow = {
  jobs: {
    claude: {
      steps: WorkflowStep[];
    };
  };
};

const readClaudeCodeActionStep = () => {
  const workflow = parse(readFileSync(workflowPath, 'utf8')) as Workflow;
  const actionStep = workflow.jobs.claude.steps.find((step) => step.uses?.startsWith('anthropics/claude-code-action@'));

  if (!actionStep) {
    throw new Error('Claude Code Action step missing');
  }

  return actionStep;
};

describe('Claude Code workflow', () => {
  test('passes the workflow token as an action input', () => {
    const actionStep = readClaudeCodeActionStep();

    expect(actionStep.with?.github_token).toBe('${{ github.token }}');
  });
});
