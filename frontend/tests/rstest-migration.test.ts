import { version } from 'bun';
import { z } from 'zod';

import { describe, expect, test } from 'bun:test';

// Copyright 2026 Redpanda Data, Inc.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageJsonSchema = z.object({
  devDependencies: z.record(z.string(), z.string()).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
});

const frontendRoot = new URL('../', import.meta.url);
const packageJson = packageJsonSchema.parse(JSON.parse(readFileSync(new URL('package.json', frontendRoot), 'utf8')));

function findFiles(directory: URL, fileNamePattern: RegExp): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);

    if (entry.isDirectory()) {
      return findFiles(child, fileNamePattern);
    }

    return fileNamePattern.test(entry.name) ? [child] : [];
  });
}

function findVitestUsages(files: URL[]): string[] {
  return files.flatMap((file) =>
    /from ['"]vitest['"]|@testing-library\/jest-dom\/vitest|\bvi\./.test(readFileSync(file, 'utf8'))
      ? [fileURLToPath(file)]
      : []
  );
}

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

describe('test runner policy', () => {
  test('runs units with Bun and integration and federation tests with Rstest', () => {
    const frontendWorkflow = readFileSync(
      new URL('../../.github/workflows/frontend-verify.yml', import.meta.url),
      'utf8'
    );

    expect(packageJson.scripts?.['test:unit']).toContain('bun test');
    expect(packageJson.scripts?.['test:integration']).toContain('rstest');
    expect(packageJson.scripts?.['test:federation']).toContain('rstest');
    expect(packageJson.scripts?.['test:ci']).toContain('test:federation');
    expect(packageJson.scripts?.['test:coverage']).toContain('test:unit --coverage');
    expect(frontendWorkflow).toContain('bun run test:federation');
    expect(version).toMatch(/^1\./);
  });

  test('pins compatible Rstest tooling to exact versions', () => {
    expect(packageJson.devDependencies?.['@module-federation/rstest']).toMatch(EXACT_VERSION);
    expect(packageJson.devDependencies?.['@rstest/core']).toMatch(EXACT_VERSION);
    expect(packageJson.devDependencies?.['@rstest/coverage-v8']).toBe(packageJson.devDependencies?.['@rstest/core']);
  });

  test('keeps frontend tests independent from Vitest', () => {
    const testFiles = [
      ...[new URL('src/', frontendRoot), new URL('tests/', frontendRoot), new URL('__mocks__/', frontendRoot)].flatMap(
        (directory) => findFiles(directory, /\.(?:test|spec|cases)\.tsx?$/)
      ),
      new URL('rstest.setup.ts', frontendRoot),
      new URL('bun.setup.ts', frontendRoot),
    ];

    expect(
      testFiles.every((file) =>
        /\.(?:test|spec|cases)\.tsx?$|\/(?:rstest|bun)\.setup(?:\.unit)?\.ts$/.test(fileURLToPath(file))
      )
    ).toBe(true);
    expect(findVitestUsages(testFiles)).toStrictEqual([]);
    expect(packageJson.devDependencies?.vitest).toBeUndefined();
    expect(packageJson.devDependencies?.['@vitest/ui']).toBeUndefined();
    expect(packageJson.devDependencies?.['@vitest/coverage-v8']).toBeUndefined();
  });

  test('removes legacy Vitest configuration', () => {
    const legacyFiles = [
      'vitest.config.mts',
      'vitest.config.unit.mts',
      'vitest.config.integration.mts',
      'vitest.shared.mts',
      'vitest.setup.ts',
      'vitest.setup.unit.ts',
      'vitest.setup.integration.ts',
    ];

    expect(legacyFiles.filter((file) => existsSync(new URL(file, frontendRoot)))).toStrictEqual([]);
  });

  test('keeps frontend testing guidance aligned with Rstest', () => {
    const guidanceFiles = [
      new URL('AGENTS.md', frontendRoot),
      ...findFiles(new URL('.claude/', frontendRoot), /\.md$/),
    ];
    const staleGuidance = guidanceFiles.flatMap((file) =>
      /vitest|bun run test:ui/i.test(readFileSync(file, 'utf8')) ? [fileURLToPath(file)] : []
    );

    expect(staleGuidance).toStrictEqual([]);
    expect(packageJson.scripts?.['test:ui']).toBeUndefined();
  });
});
