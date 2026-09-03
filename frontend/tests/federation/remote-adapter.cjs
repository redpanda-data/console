// Copyright 2026 Redpanda Data, Inc.

'use strict';

const remote = require('../../dist/federation-test/remoteEntry.cjs');

if (!remote.rp_console) {
  throw new Error('Federation build did not export the rp_console container');
}

module.exports = remote.rp_console;
