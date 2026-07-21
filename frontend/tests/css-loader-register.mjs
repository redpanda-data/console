/**
 * Node.js module hook registration shim.
 *
 * Replaces the deprecated `--experimental-loader` flag (which emits a
 * DeprecationWarning on every worker). Paired with NODE_OPTIONS='--import
 * ./tests/css-loader-register.mjs' in the test:integration script.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./css-loader.mjs', pathToFileURL(`${import.meta.dirname}/`));
