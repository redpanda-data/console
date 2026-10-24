import { createRsbuild, loadConfig, rspack } from '@rsbuild/core';
import { RsdoctorRspackPlugin } from '@rsdoctor/core';

import { writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = process.argv[2];
const frontendDirectory = fileURLToPath(new URL('../../', import.meta.url));
const { content } = await loadConfig({ cwd: frontendDirectory });
const rsbuild = await createRsbuild({ config: content, cwd: frontendDirectory });
const { origin } = await rsbuild.inspectConfig({ mode: 'production' });
const bundlerConfig = origin.bundlerConfigs.find((config) => config.name === 'web');
if (!bundlerConfig) {
  throw new Error('Console web production configuration not found');
}
const plugins = (bundlerConfig.plugins ?? []).filter((plugin) => plugin instanceof RsdoctorRspackPlugin);
if (plugins.length !== Number(Boolean(process.env.RSDOCTOR))) {
  throw new Error('Unexpected RsdoctorRspackPlugin count in Console web production configuration');
}
// Preserve configured analysis options, but isolate fixture output from the real report.
for (const plugin of plugins) {
  if (!isAbsolute(plugin.options.output.reportDir)) {
    throw new Error('Console analysis report directory must not depend on the working directory');
  }
  plugin.options.output.reportDir = join(directory, 'build-stats/rsdoctor');
}

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
  await new Promise((resolve, reject) => {
    compiler.close((error) => (error ? reject(error) : resolve()));
  });
}
