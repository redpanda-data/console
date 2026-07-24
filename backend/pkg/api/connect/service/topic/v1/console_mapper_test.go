// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package topic

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/redpanda-data/console/backend/pkg/console"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

// TestConsoleTopicSummariesToProto guards the Console ListTopics response shape: the cleanup policy
// and the aggregated log dir summary (size, hint, per-broker replica errors) must survive the
// mapping from console.TopicSummary. A regression here surfaces as empty cleanup-policy / size
// columns in the UI. These fields live on the Console API rather than the dataplane one, which
// deliberately exposes only cheap metadata.
func TestConsoleTopicSummariesToProto(t *testing.T) {
	testCases := []struct {
		name       string
		input      []*console.TopicSummary
		validateFn func(t *testing.T, result []*v1alpha1.ListTopicsResponse_Topic)
	}{
		{
			name: "maps cleanup policy and log dir summary",
			input: []*console.TopicSummary{
				{
					TopicName:         "orders",
					IsInternal:        false,
					PartitionCount:    3,
					ReplicationFactor: 2,
					CleanupPolicy:     "compact",
					LogDirSummary: console.TopicLogDirSummary{
						TotalSizeBytes: 2048,
						Hint:           "partial result",
						ReplicaErrors: []console.TopicLogDirSummaryReplicaError{
							{BrokerID: 1, Error: "broker down"},
						},
					},
				},
			},
			validateFn: func(t *testing.T, result []*v1alpha1.ListTopicsResponse_Topic) {
				require.Len(t, result, 1)
				topic := result[0]
				assert.Equal(t, "orders", topic.GetName())
				assert.False(t, topic.GetInternal())
				assert.Equal(t, int32(3), topic.GetPartitionCount())
				assert.Equal(t, int32(2), topic.GetReplicationFactor())
				assert.Equal(t, "compact", topic.GetCleanupPolicy())

				summary := topic.GetLogDirSummary()
				require.NotNil(t, summary)
				assert.Equal(t, int64(2048), summary.GetTotalSizeBytes())
				assert.Equal(t, "partial result", summary.GetHint())
				require.Len(t, summary.GetReplicaErrors(), 1)
				assert.Equal(t, int32(1), summary.GetReplicaErrors()[0].GetBrokerId())
				assert.Equal(t, "broker down", summary.GetReplicaErrors()[0].GetError())
			},
		},
		{
			name: "preserves order and the N/A cleanup policy fallback",
			input: []*console.TopicSummary{
				{TopicName: "a", CleanupPolicy: "delete", LogDirSummary: console.TopicLogDirSummary{TotalSizeBytes: 1}},
				{TopicName: "b", CleanupPolicy: "N/A", LogDirSummary: console.TopicLogDirSummary{TotalSizeBytes: 2}},
			},
			validateFn: func(t *testing.T, result []*v1alpha1.ListTopicsResponse_Topic) {
				require.Len(t, result, 2)
				assert.Equal(t, "a", result[0].GetName())
				assert.Equal(t, "delete", result[0].GetCleanupPolicy())
				assert.Equal(t, "b", result[1].GetName())
				assert.Equal(t, "N/A", result[1].GetCleanupPolicy())
				assert.Empty(t, result[1].GetLogDirSummary().GetReplicaErrors())
			},
		},
		{
			name:  "empty input yields empty slice",
			input: []*console.TopicSummary{},
			validateFn: func(t *testing.T, result []*v1alpha1.ListTopicsResponse_Topic) {
				assert.Empty(t, result)
			},
		},
	}

	consoleMapper := consoleMapper{}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			out := consoleMapper.topicSummariesToProto(tc.input)
			tc.validateFn(t, out)
		})
	}
}
