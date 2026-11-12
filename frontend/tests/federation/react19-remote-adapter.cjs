// Copyright 2026 Redpanda Data, Inc.

'use strict';

/** @type {unknown} */
const container = require('../../dist/federation-test-react19/remoteEntry.cjs');

if (
  typeof container !== 'object' ||
  container === null ||
  !('get' in container) ||
  typeof container.get !== 'function' ||
  !('init' in container) ||
  typeof container.init !== 'function'
) {
  throw new Error('remoteEntry.cjs did not export a federation container (get/init)');
}

module.exports = container;
