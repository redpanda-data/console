#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

/**
 * Fix remark-emoji version mismatch between main project and @redpanda-data/ui
 *
 * This script syncs the remark-emoji package from the main node_modules to the
 * @redpanda-data/ui nested node_modules to resolve module resolution conflicts
 * when running tests with Bun.
 */
function fixRemarkEmojiVersions() {
  const srcPath = path.join(__dirname, '..', 'node_modules', 'remark-emoji');
  const destPath = path.join(__dirname, '..', 'node_modules', '@redpanda-data', 'ui', 'node_modules', 'remark-emoji');

  try {
    // Only proceed if both source and destination exist
    if (!fs.existsSync(srcPath)) {
      console.log('remark-emoji not found in main node_modules, skipping sync');
      return;
    }

    if (!fs.existsSync(destPath)) {
      console.log('@redpanda-data/ui remark-emoji not found, skipping sync');
      return;
    }

    // Remove the old version and copy the new one
    fs.rmSync(destPath, { recursive: true, force: true });
    fs.cpSync(srcPath, destPath, { recursive: true });

    console.log('Successfully synced remark-emoji versions');
  } catch (error) {
    console.warn('Could not sync remark-emoji versions:', error.message);
  }
}

if (require.main === module) {
  fixRemarkEmojiVersions();
}

module.exports = fixRemarkEmojiVersions;
