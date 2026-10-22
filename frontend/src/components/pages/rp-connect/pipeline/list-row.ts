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

import { getUserTagEntries } from 'components/constants';
import type { Pipeline as APIPipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { parseConfigComponentsCached } from './config-components-cache';
import { isDraft, timestampToMillis } from './draft-copy';
import { cpuToTasks } from '../tasks';
import type { PipelineEndStatus } from '../utils/input-end-behavior';

export type TagPair = { key: string; value: string };

export type PipelineRow = {
  id: string;
  name: string;
  description: string;
  state: Pipeline_State;
  inputs: string[];
  outputs: string[];
  tags: TagPair[];
  isDraft: boolean;
  /** Epoch ms of the last edit. */
  editedAt: number | null;
  /** Empty on a deployed row: only a draft opens the start confirmation, which names these. */
  configYaml: string;
  computeUnits: number;
  /** Whether it stops on its own — what a schedule will need. */
  end: PipelineEndStatus;
};

export const toPipelineRow = (apiPipeline: APIPipeline): PipelineRow => {
  const { inputs, outputs, end } = parseConfigComponentsCached(apiPipeline.configYaml);
  const tags = getUserTagEntries(apiPipeline.tags);
  const draft = isDraft(apiPipeline);
  return {
    id: apiPipeline.id,
    name: apiPipeline.displayName,
    description: apiPipeline.description,
    state: apiPipeline.state,
    inputs,
    outputs,
    tags,
    isDraft: draft,
    editedAt: timestampToMillis(apiPipeline.updateTime),
    configYaml: draft ? apiPipeline.configYaml : '',
    computeUnits: draft ? (cpuToTasks(apiPipeline.resources?.cpuShares) ?? 0) : 0,
    end,
  };
};

// One string per tag pair, so `arrIncludesSome` and the facet counts agree on the value.
export const tagFilterValue = (tag: TagPair) => `${tag.key}:${tag.value}`;
