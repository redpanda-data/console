import { createRsbuild, loadConfig, rspack } from '@rsbuild/core';

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = process.argv[2];
const { content } = await loadConfig({ cwd: process.cwd() });
const rsbuild = await createRsbuild({ config: content, cwd: process.cwd() });
const { origin } = await rsbuild.inspectConfig({ mode: 'production' });
const plugins = origin.bundlerConfigs[0].plugins.filter((plugin) => plugin?.name === 'RsdoctorRspackPlugin');

await writeFile(join(directory, 'entry.js'), 'console.log("Rsdoctor report fixture");');
process.chdir(directory);
const compiler = rspack({
  mode: 'production',
  context: directory,
  entry: './entry.js',
  output: { path: join(directory, 'dist'), filename: 'fixture.js' },
  plugins,
});

try {
  await new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error || !stats || stats.hasErrors()) {
        reject(error || new Error(stats?.toString({ all: false, errors: true })));
      } else {
        resolve();
      }
    });
  });
} finally {
  await new Promise((resolve, reject) => compiler.close((error) => (error ? reject(error) : resolve())));
}
