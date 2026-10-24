// Copyright 2026 Redpanda Data, Inc.

'use strict';

const container = require('../../dist/federation-test-react19/remoteEntry.cjs');

if (typeof container.get !== 'function' || typeof container.init !== 'function') {
  throw new Error('remoteEntry.cjs did not export a federation container (get/init)');
}

module.exports = container;
