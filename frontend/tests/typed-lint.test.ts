import { spawnSync } from 'bun';
import { z } from 'zod';

import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const reportSchema = z.object({ diagnostics: z.array(z.object({ code: z.string().optional() })) });

function createProject(source: string) {
  const directory = mkdtempSync(join(tmpdir(), 'console-typed-lint-'));
  symlinkSync(join(frontend, 'node_modules'), join(directory, 'node_modules'), 'dir');
  writeFileSync(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        jsx: 'react-jsx',
        target: 'ES2025',
        moduleResolution: 'bundler',
        module: 'esnext',
      },
    })
  );
  const file = join(directory, 'editor.tsx');
  writeFileSync(file, source);
  return { directory, file };
}

function lint(source: string) {
  const { directory, file } = createProject(source);
  try {
    const result = spawnSync(
      [
        process.execPath,
        'run',
        'oxlint',
        '--config',
        join(frontend, 'oxlint.config.ts'),
        '--disable-nested-config',
        '--deny-warnings',
        '--report-unused-disable-directives-severity=error',
        '--format=json',
        file,
      ],
      { cwd: frontend, stdout: 'pipe', stderr: 'pipe' }
    );
    const report = reportSchema.parse(JSON.parse(result.stdout.toString()));
    return { exitCode: result.exitCode, rules: report.diagnostics.map((diagnostic) => diagnostic.code) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const FORWARDED_STATE_RULE = 'react-doctor(forwarded-set-state-in-effect)';
const component = (effect: string) => `
  import { useEffect, useState } from 'react';
  function synchronize(id: string, setValue: (value: string) => void) { setValue(id); }
  export function Editor({ id }: { id: string }) {
    const [value, setValue] = useState('');
    useEffect(() => { ${effect} }, [id]);
    return <div>{value}</div>;
  }
`;

test('rejects a state setter forwarded to synchronous effect work', () => {
  const result = lint(component('synchronize(id, setValue);'));
  expect(result.rules).toContain(FORWARDED_STATE_RULE);
  expect(result.exitCode).toBe(1);
});

test('allows a state setter called by an asynchronous effect subscription', () => {
  const result = lint(
    component('const timer = setTimeout(() => synchronize(id, setValue), 10); return () => clearTimeout(timer);')
  );
  expect(result.rules).toStrictEqual([]);
  expect(result.exitCode).toBe(0);
});
