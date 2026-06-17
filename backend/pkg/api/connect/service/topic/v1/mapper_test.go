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
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/console"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func TestDeleteTopicRequestToKafka(t *testing.T) {
	testCases := []struct {
		name       string
		input      *v1.DeleteTopicRequest
		validateFn func(t *testing.T, mappingResult kmsg.DeleteTopicsRequest)
	}{
		{
			name: "Test case 1",
			input: &v1.DeleteTopicRequest{
				TopicName: "test",
			},
			validateFn: func(t *testing.T, mappingResult kmsg.DeleteTopicsRequest) {
				require.Len(t, mappingResult.TopicNames, 1)
				require.Len(t, mappingResult.Topics, 1)
				assert.Equal(t, "test", mappingResult.TopicNames[0])
				assert.Equal(t, new("test"), mappingResult.Topics[0].Topic)
			},
		},
	}

	kafkaMapper := mapper{}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			out := kafkaMapper.deleteTopicToKmsg(tc.input)
			tc.validateFn(t, out)
		})
	}
}

func TestDescribeTopicConfigsToKafka(t *testing.T) {
	testCases := []struct {
		name       string
		input      *v1.GetTopicConfigurationsRequest
		validateFn func(t *testing.T, mappingResult kmsg.DescribeConfigsRequest)
	}{
		{
			name: "Describe Topic Configs",
			input: &v1.GetTopicConfigurationsRequest{
				TopicName: "test-topic",
			},
			validateFn: func(t *testing.T, mappingResult kmsg.DescribeConfigsRequest) {
				require.Len(t, mappingResult.Resources, 1)
				assert.Equal(t, "test-topic", mappingResult.Resources[0].ResourceName)
				assert.Equal(t, kmsg.ConfigResourceTypeTopic, mappingResult.Resources[0].ResourceType)
				assert.Nil(t, mappingResult.Resources[0].ConfigNames)
			},
		},
	}

	kafkaMapper := mapper{}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			out := kafkaMapper.describeTopicConfigsToKafka(tc.input)
			tc.validateFn(t, out)
		})
	}
}

// TestTopicSummariesToProto guards the ListTopics gRPC response shape: the
// cleanup policy and the aggregated log dir summary (size, hint, per-broker
// replica errors) must survive the mapping from console.TopicSummary. A
// regression here surfaces as empty cleanup-policy / size columns in the UI.
func TestTopicSummariesToProto(t *testing.T) {
	testCases := []struct {
		name       string
		input      []*console.TopicSummary
		validateFn func(t *testing.T, result []*v1.ListTopicsResponse_Topic)
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
			validateFn: func(t *testing.T, result []*v1.ListTopicsResponse_Topic) {
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
			validateFn: func(t *testing.T, result []*v1.ListTopicsResponse_Topic) {
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
			validateFn: func(t *testing.T, result []*v1.ListTopicsResponse_Topic) {
				assert.Empty(t, result)
			},
		},
	}

	kafkaMapper := mapper{}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			out := kafkaMapper.topicSummariesToProto(tc.input)
			tc.validateFn(t, out)
		})
	}
}
