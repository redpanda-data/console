import { spawnSync } from 'bun';

import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('../', import.meta.url));
function lintCss(css: string) {
  return spawnSync(
    [
      process.execPath,
      'run',
      'stylelint',
      '--config',
      'stylelint.config.mjs',
      '--stdin',
      '--stdin-filename',
      'src/probe.css',
      '--max-warnings=0',
    ],
    {
      cwd: frontend,
      stdin: Buffer.from(css),
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
}

test.each([
  '.button { opacity: 1 !important; }',
  '/* stylelint-disable console/no-important */\n.button { opacity: 1 !important; }',
  '@media (prefers-reduced-motion: no-preference) { *, *::before, *::after { animation-duration: 0.01ms !important; } }',
  '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { color: red !important; } }',
])('rejects important declarations outside the accessibility contract: %s', (css) => {
  const result = lintCss(css);
  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString() + result.stdout.toString()).toContain('console/no-important');
});

test('accepts the global reduced-motion accessibility override', () => {
  const result = lintCss(`@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}`);
  expect(result.stderr.toString() + result.stdout.toString()).toBe('');
  expect(result.exitCode).toBe(0);
});
