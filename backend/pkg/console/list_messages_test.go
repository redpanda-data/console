// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func TestCalculateConsumeRequests_AllPartitions_FewNewestMessages(t *testing.T) {
	svc := Service{}

	// Request less messages than we have partitions
	startOffsets := make(kadm.ListedOffsets)
	startOffsets["test"] = map[int32]kadm.ListedOffset{
		0: {Topic: "test", Partition: 0, Offset: 0},
		1: {Topic: "test", Partition: 1, Offset: 0},
		2: {Topic: "test", Partition: 2, Offset: 10},
	}

	endOffsets := make(kadm.ListedOffsets)
	endOffsets["test"] = map[int32]kadm.ListedOffset{
		0: {Topic: "test", Partition: 0, Offset: 300},
		1: {Topic: "test", Partition: 1, Offset: 10},
		2: {Topic: "test", Partition: 2, Offset: 30},
	}

	req := &ListMessageRequest{
		TopicName:    "test",
		PartitionID:  partitionsAll, // All partitions
		StartOffset:  StartOffsetRecent,
		MessageCount: 3,
	}

	// Expected result should be able to return all 100 requested messages as evenly distributed as possible
	expected := map[int32]*PartitionConsumeRequest{
		0: {PartitionID: 0, IsDrained: false, StartOffset: 300 - 1, EndOffset: 300 - 1, MaxMessageCount: 1, LowWaterMark: 0, HighWaterMark: 300},
		1: {PartitionID: 1, IsDrained: false, StartOffset: 10 - 1, EndOffset: 10 - 1, MaxMessageCount: 1, LowWaterMark: 0, HighWaterMark: 10},
		2: {PartitionID: 2, IsDrained: false, StartOffset: 30 - 1, EndOffset: 30 - 1, MaxMessageCount: 1, LowWaterMark: 10, HighWaterMark: 30},
	}
	actual, err := svc.calculateConsumeRequests(t.Context(), nil, req, []int32{0, 1, 2}, startOffsets, endOffsets)
	require.NoError(t, err)
	assert.Equal(t, expected, actual, "expected other result for unbalanced message distribution - all partition IDs")
}

func TestCalculateConsumeRequests_TimestampEmptyRetainedPartition(t *testing.T) {
	const (
		topicName = "test-topic"
		timestamp = int64(1785733373576)
	)

	fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1), kfake.SeedTopics(1, topicName))
	require.NoError(t, err)
	t.Cleanup(fakeCluster.Close)

	client, err := kgo.NewClient(kgo.SeedBrokers(fakeCluster.ListenAddrs()...))
	require.NoError(t, err)
	t.Cleanup(client.Close)

	fakeCluster.Control(func(req kmsg.Request) (kmsg.Response, error, bool) {
		fakeCluster.KeepControl()

		listOffsetsReq, ok := req.(*kmsg.ListOffsetsRequest)
		if !ok {
			return nil, nil, false
		}

		require.Len(t, listOffsetsReq.Topics, 1)
		assert.Equal(t, topicName, listOffsetsReq.Topics[0].Topic)
		require.Len(t, listOffsetsReq.Topics[0].Partitions, 1)
		assert.Equal(t, timestamp, listOffsetsReq.Topics[0].Partitions[0].Timestamp)

		res := listOffsetsReq.ResponseKind().(*kmsg.ListOffsetsResponse)
		res.Topics = []kmsg.ListOffsetsResponseTopic{kmsg.NewListOffsetsResponseTopic()}
		res.Topics[0].Topic = topicName
		res.Topics[0].Partitions = []kmsg.ListOffsetsResponseTopicPartition{kmsg.NewListOffsetsResponseTopicPartition()}
		res.Topics[0].Partitions[0].Partition = 0
		res.Topics[0].Partitions[0].Timestamp = timestamp
		// Kafka returns -1 when timestamp lookup finds no retained record.
		res.Topics[0].Partitions[0].Offset = -1

		return res, nil, true
	})

	// Retention has removed every record, so the low and high watermarks are equal.
	offsets := kadm.ListedOffsets{
		topicName: {
			0: {Topic: topicName, Partition: 0, Offset: 150},
		},
	}
	req := &ListMessageRequest{
		TopicName:      topicName,
		PartitionID:    partitionsAll,
		StartOffset:    StartOffsetTimestamp,
		StartTimestamp: timestamp,
		MessageCount:   10,
	}

	// Pass the same offsets as earliest and latest to model an empty partition.
	actual, err := (&Service{}).calculateConsumeRequests(t.Context(), client, req, []int32{0}, offsets, offsets)
	require.NoError(t, err)
	assert.Empty(t, actual)
}

func TestCalculateConsumeRequests_AllPartitions_Unbalanced(t *testing.T) {
	svc := Service{}

	startOffsets := make(kadm.ListedOffsets)
	startOffsets["test"] = map[int32]kadm.ListedOffset{
		0: {Topic: "test", Partition: 0, Offset: 0},
		1: {Topic: "test", Partition: 1, Offset: 0},
		2: {Topic: "test", Partition: 2, Offset: 10},
	}

	endOffsets := make(kadm.ListedOffsets)
	endOffsets["test"] = map[int32]kadm.ListedOffset{
		0: {Topic: "test", Partition: 0, Offset: 300},
		1: {Topic: "test", Partition: 1, Offset: 10},
		2: {Topic: "test", Partition: 2, Offset: 30},
	}

	req := &ListMessageRequest{
		TopicName:    "test",
		PartitionID:  partitionsAll, // All partitions
		StartOffset:  StartOffsetOldest,
		MessageCount: 100,
	}

	// Expected result should be able to return all 100 requested messages as evenly distributed as possible
	expected := map[int32]*PartitionConsumeRequest{
		0: {PartitionID: 0, IsDrained: false, LowWaterMark: 0, HighWaterMark: 300, StartOffset: 0, EndOffset: 300 - 1, MaxMessageCount: 70},
		1: {PartitionID: 1, IsDrained: true, LowWaterMark: 0, HighWaterMark: 10, StartOffset: 0, EndOffset: 10 - 1, MaxMessageCount: 10},
		2: {PartitionID: 2, IsDrained: true, LowWaterMark: 10, HighWaterMark: 30, StartOffset: 10, EndOffset: 30 - 1, MaxMessageCount: 20},
	}
	actual, err := svc.calculateConsumeRequests(t.Context(), nil, req, []int32{0, 1, 2}, startOffsets, endOffsets)
	require.NoError(t, err)
	assert.Equal(t, expected, actual, "expected other result for unbalanced message distribution - all partition IDs")
}

func TestCalculateConsumeRequests_SinglePartition(t *testing.T) {
	svc := Service{}

	startOffsets := make(kadm.ListedOffsets)
	startOffsets["test"] = map[int32]kadm.ListedOffset{
		14: {Topic: "test", Partition: 14, Offset: 100},
	}

	endOffsets := make(kadm.ListedOffsets)
	endOffsets["test"] = map[int32]kadm.ListedOffset{
		14: {Topic: "test", Partition: 14, Offset: 300},
	}

	lowMark := int64(100)
	highMark := int64(300)

	tt := []struct {
		req      *ListMessageRequest
		expected map[int32]*PartitionConsumeRequest
	}{
		// Recent 100 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: StartOffsetRecent, MessageCount: 100},
			map[int32]*PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: false, StartOffset: highMark - 100, EndOffset: highMark - 1, MaxMessageCount: 100, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Oldest 40 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: StartOffsetOldest, MessageCount: 40},
			map[int32]*PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: false, StartOffset: lowMark, EndOffset: highMark - 1, MaxMessageCount: 40, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Custom start offset with drained - 50 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: 250, MessageCount: 200},
			map[int32]*PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: true, StartOffset: 250, EndOffset: highMark - 1, MaxMessageCount: 50, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Custom out of bounds start offset - 50 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: 15, MessageCount: 50},
			map[int32]*PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: false, StartOffset: lowMark, EndOffset: highMark - 1, MaxMessageCount: 50, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Recent 500 messages with drained
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: StartOffsetRecent, MessageCount: 500},
			map[int32]*PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: true, StartOffset: lowMark, EndOffset: highMark - 1, MaxMessageCount: 200, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Oldest 500 messages with drained
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: StartOffsetOldest, MessageCount: 500},
			map[int32]*PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: true, StartOffset: lowMark, EndOffset: highMark - 1, MaxMessageCount: 200, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Newest/Live tail 10 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: StartOffsetNewest, MessageCount: 10},
			map[int32]*PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: false, StartOffset: -1, EndOffset: math.MaxInt64, MaxMessageCount: 10, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},
	}

	for i, table := range tt {
		actual, err := svc.calculateConsumeRequests(t.Context(), nil, table.req, []int32{14}, startOffsets, endOffsets)
		assert.NoError(t, err)
		assert.Equal(t, table.expected, actual, "expected other result for single partition test. Case: ", i)
	}
}

func TestCalculateConsumeRequests_AllPartitions_WithFilter(t *testing.T) {
	svc := Service{}
	// Request less messages than we have partitions, if filter code is set we handle consume requests different than
	// usual - as we don't care about the distribution between partitions.
	startOffsets := make(kadm.ListedOffsets)
	startOffsets["test"] = map[int32]kadm.ListedOffset{
		0: {Topic: "test", Partition: 0, Offset: 0},
		1: {Topic: "test", Partition: 1, Offset: 0},
		2: {Topic: "test", Partition: 2, Offset: 0},
	}

	endOffsets := make(kadm.ListedOffsets)
	endOffsets["test"] = map[int32]kadm.ListedOffset{
		0: {Topic: "test", Partition: 0, Offset: 300},
		1: {Topic: "test", Partition: 1, Offset: 300},
		2: {Topic: "test", Partition: 2, Offset: 300},
	}

	tt := []struct {
		req      *ListMessageRequest
		expected map[int32]*PartitionConsumeRequest
	}{
		{
			&ListMessageRequest{
				TopicName:             "test",
				PartitionID:           partitionsAll, // All partitions
				StartOffset:           StartOffsetOldest,
				MessageCount:          2,
				FilterInterpreterCode: "random string that simulates some javascript code",
			},
			map[int32]*PartitionConsumeRequest{
				0: {PartitionID: 0, IsDrained: false, StartOffset: 0, EndOffset: 299, MaxMessageCount: 2, LowWaterMark: 0, HighWaterMark: 300},
				1: {PartitionID: 1, IsDrained: false, StartOffset: 0, EndOffset: 299, MaxMessageCount: 2, LowWaterMark: 0, HighWaterMark: 300},
				2: {PartitionID: 2, IsDrained: false, StartOffset: 0, EndOffset: 299, MaxMessageCount: 2, LowWaterMark: 0, HighWaterMark: 300},
			},
		},
		{
			&ListMessageRequest{
				TopicName:             "test",
				PartitionID:           partitionsAll, // All partitions
				StartOffset:           StartOffsetRecent,
				MessageCount:          50,
				FilterInterpreterCode: "random string that simulates some javascript code",
			},
			map[int32]*PartitionConsumeRequest{
				0: {PartitionID: 0, IsDrained: false, StartOffset: 249, EndOffset: 299, MaxMessageCount: 50, LowWaterMark: 0, HighWaterMark: 300},
				1: {PartitionID: 1, IsDrained: false, StartOffset: 249, EndOffset: 299, MaxMessageCount: 50, LowWaterMark: 0, HighWaterMark: 300},
				2: {PartitionID: 2, IsDrained: false, StartOffset: 249, EndOffset: 299, MaxMessageCount: 50, LowWaterMark: 0, HighWaterMark: 300},
			},
		},
	}

	for i, table := range tt {
		actual, err := svc.calculateConsumeRequests(t.Context(), nil, table.req, []int32{0, 1, 2}, startOffsets, endOffsets)
		assert.NoError(t, err)
		assert.Equal(t, table.expected, actual, "expected other result for all partitions with filter enable. Case: ", i)
	}
}
