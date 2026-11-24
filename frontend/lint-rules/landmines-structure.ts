import structure from '@interfere/landmines/structure';

import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const consoleTests = fileURLToPath(new URL('../tests/', import.meta.url));
const registryContracts = fileURLToPath(new URL('../src/components/registry-contracts/', import.meta.url));
const registry = fileURLToPath(new URL('../src/components/redpanda-ui/', import.meta.url));
const testFileNames = structure.rules?.['test-file-names'];
const createTestFileNames = testFileNames?.create;
const colocatedTests = structure.rules?.['colocated-tests'];
const createColocatedTests = colocatedTests?.create;
if (!(createTestFileNames && createColocatedTests)) {
  throw new Error('Expected Landmines structure rules to expose create visitors');
}

function isConsoleTestHarness(filename: string) {
  const path = relative(consoleTests, dirname(filename));
  const parts = path.split(sep);
  return !isAbsolute(path) && parts[0] !== '..' && !parts.includes('tests') && !parts.includes('__tests__');
}

export default {
  ...structure,
  rules: {
    ...structure.rules,
    'colocated-tests': {
      ...colocatedTests,
      create(context: Parameters<typeof createColocatedTests>[0]) {
        if (relative(registryContracts, dirname(context.physicalFilename)) !== '') {
          return createColocatedTests(context);
        }
        const report = (diagnostic: Parameters<typeof context.report>[0]) => {
          const owner = diagnostic.data?.owner;
          const vendoredOwner = typeof owner === 'string' ? relative(registry, resolve(context.cwd, owner)) : '..';
          if (
            diagnostic.messageId !== 'detached' ||
            isAbsolute(vendoredOwner) ||
            vendoredOwner.split(sep)[0] === '..'
          ) {
            context.report(diagnostic);
          }
        };
        return createColocatedTests(Object.create(context, { report: { value: report } }));
      },
    },
    'test-file-names': {
      ...testFileNames,
      create(context: Parameters<typeof createTestFileNames>[0]) {
        if (!isConsoleTestHarness(context.physicalFilename)) {
          return createTestFileNames(context);
        }

        const report = (diagnostic: Parameters<typeof context.report>[0]) => {
          if (diagnostic.messageId !== 'directory') {
            context.report(diagnostic);
          }
        };

        return createTestFileNames(Object.create(context, { report: { value: report } }));
      },
    },
  },
};
