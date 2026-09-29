// Copyright 2026 Redpanda Data, Inc.

'use strict';

// `commonjs-module` exports the container itself (@module-federation >= 2.9).
const container = require('../../dist/federation-test/remoteEntry.cjs');

if (typeof container.get !== 'function' || typeof container.init !== 'function') {
  throw new Error('Federation build did not export the rp_console container');
}

module.exports = container;
