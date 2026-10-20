// Copyright 2026 Redpanda Data, Inc.

'use strict';

// `commonjs-module` exports the container itself (@module-federation >= 2.9), so only its
// shape can be checked here. The remote name and filename Cloud UI loads are asserted in
// src/federation/module-federation-config.test.ts.
const container = require('../../dist/federation-test/remoteEntry.cjs');

if (typeof container.get !== 'function' || typeof container.init !== 'function') {
  throw new Error('remoteEntry.cjs did not export a federation container (get/init)');
}

module.exports = container;
