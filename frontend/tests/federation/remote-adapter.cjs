// Copyright 2026 Redpanda Data, Inc.

'use strict';

// WARNING: The legacy commonjs module exports the container directly; source config tests cover the public name and filename.
const container = require('../../dist/federation-test/remoteEntry.cjs');

if (typeof container.get !== 'function' || typeof container.init !== 'function') {
  throw new Error('remoteEntry.cjs did not export a federation container (get/init)');
}

module.exports = container;
