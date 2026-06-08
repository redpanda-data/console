/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

// Templates live one-per-directory under ./templates, each pairing its slot
// definitions (index.ts) with a real, editor-lintable config.yaml. This barrel
// preserves the original import path.
export { getTemplateById, PIPELINE_TEMPLATES } from './templates';
