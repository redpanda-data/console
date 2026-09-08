// Copyright 2026 Redpanda Data, Inc.

import { describe, expect, test } from '@rstest/core';

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface PackageJson {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

const frontendRoot = new URL('../', import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL('package.json', frontendRoot), 'utf8')) as PackageJson;

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
  return files
    .filter((file) => /from ['"]vitest['"]|@testing-library\/jest-dom\/vitest|\bvi\./.test(readFileSync(file, 'utf8')))
    .map((file) => fileURLToPath(file));
}

describe('test runner policy', () => {
  test('runs unit, integration, and federation tests with Rstest', () => {
    const frontendWorkflow = readFileSync(
      new URL('../../.github/workflows/frontend-verify.yml', import.meta.url),
      'utf8'
    );

    expect(packageJson.scripts?.['test:unit']).toContain('rstest');
    expect(packageJson.scripts?.['test:integration']).toContain('rstest');
    expect(packageJson.scripts?.['test:federation']).toContain('rstest');
    expect(packageJson.scripts?.['test:ci']).toContain('test:federation');
    expect(packageJson.scripts?.['test:coverage']).toContain('rstest');
    expect(packageJson.devDependencies?.['@module-federation/rstest']).toBe('2.9.0');
    expect(packageJson.devDependencies?.['@rstest/core']).toBe('0.11.11');
    expect(packageJson.devDependencies?.['@rstest/coverage-v8']).toBe('0.11.11');
    expect(frontendWorkflow).toContain('bun run test:federation');
    expect(import.meta.env.RSTEST).toBe('true');
  });

  test('keeps frontend tests independent from Vitest', () => {
    const testFiles = [
      ...[new URL('src/', frontendRoot), new URL('tests/', frontendRoot), new URL('__mocks__/', frontendRoot)].flatMap(
        (directory) => findFiles(directory, /\.(?:test|spec)\.tsx?$/)
      ),
      new URL('rstest.setup.ts', frontendRoot),
      new URL('rstest.setup.unit.ts', frontendRoot),
    ];

    expect(
      testFiles.every((file) => /\.(?:test|spec)\.tsx?$|\/rstest\.setup(?:\.unit)?\.ts$/.test(fileURLToPath(file)))
    ).toBe(true);
    expect(findVitestUsages(testFiles)).toEqual([]);
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

    expect(legacyFiles.filter((file) => existsSync(new URL(file, frontendRoot)))).toEqual([]);
  });

  test('keeps frontend testing guidance aligned with Rstest', () => {
    const guidanceFiles = [
      new URL('AGENTS.md', frontendRoot),
      ...findFiles(new URL('.claude/', frontendRoot), /\.md$/),
    ];
    const staleGuidance = guidanceFiles
      .filter((file) => /vitest|bun run test:ui/i.test(readFileSync(file, 'utf8')))
      .map((file) => fileURLToPath(file));

    expect(staleGuidance).toEqual([]);
    expect(packageJson.scripts?.['test:ui']).toBeUndefined();
  });
});
