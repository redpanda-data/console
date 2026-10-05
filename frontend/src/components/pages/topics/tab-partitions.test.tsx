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

import { create } from '@bufbuild/protobuf';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return { ...actual, useLocation: () => ({ searchStr: '' }) };
});

rs.mock('state/backend-api', () => {
  const actual = rs.requireActual<typeof import('state/backend-api')>('state/backend-api');
  return {
    ...actual,
    api: { ...actual.api, refreshCluster: rs.fn() },
  };
});

import {
  GetClusterHealthResponseSchema,
  TopicPartitionsSchema,
} from 'protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { useApiStore } from 'state/backend-api';
import type { Partition, Topic } from 'state/rest-interfaces';

import { TopicPartitions } from './tab-partitions';

const TOPIC_NAME = 'test-topic';

const topic = { topicName: TOPIC_NAME, cleanupPolicy: 'delete' } as Topic;

const makePartition = (id: number): Partition => ({
  id,
  partitionError: null,
  replicas: [0],
  offlineReplicas: null,
  inSyncReplicas: [0],
  leader: 0,
  partitionLogDirs: [],
  waterMarksError: null,
  waterMarkLow: 0,
  waterMarkHigh: 10,
  replicaSize: 0,
  topicName: TOPIC_NAME,
  hasErrors: false,
});

const renderPartitions = () =>
  render(
    <NuqsTestingAdapter>
      <TopicPartitions topic={topic} />
    </NuqsTestingAdapter>
  );

describe('TopicPartitions', () => {
  beforeEach(() => {
    useApiStore.setState({ topicPartitions: new Map(), clusterHealth: undefined });
  });

  test('renders the table once partitions finish loading', () => {
    renderPartitions();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    act(() => {
      useApiStore.setState({ topicPartitions: new Map([[TOPIC_NAME, [makePartition(0), makePartition(1)]]]) });
    });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  test('renders no table when partitions are not viewable', () => {
    useApiStore.setState({ topicPartitions: new Map([[TOPIC_NAME, null]]) });

    renderPartitions();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('flags leaderless and under-replicated partitions', () => {
    useApiStore.setState({
      topicPartitions: new Map([[TOPIC_NAME, [makePartition(0), makePartition(1)]]]),
      clusterHealth: create(GetClusterHealthResponseSchema, {
        leaderlessPartitions: [create(TopicPartitionsSchema, { topicName: TOPIC_NAME, partitionIds: [0] })],
        underReplicatedPartitions: [create(TopicPartitionsSchema, { topicName: TOPIC_NAME, partitionIds: [1] })],
      }),
    });

    renderPartitions();

    expect(screen.getByText('Leaderless')).toBeInTheDocument();
    expect(screen.getByText('Under-replicated')).toBeInTheDocument();
  });
});
