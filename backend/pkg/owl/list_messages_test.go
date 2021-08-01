package owl

import (
	"context"
	"github.com/stretchr/testify/require"
	"math"
	"testing"

	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/stretchr/testify/assert"
)

func TestCalculateConsumeRequests_AllPartitions_FewNewestMessages(t *testing.T) {
	svc := Service{}
	// Request less messages than we have partitions
	marks := map[int32]*kafka.PartitionMarks{
		0: {PartitionID: 0, Low: 0, High: 300},
		1: {PartitionID: 1, Low: 0, High: 10},
		2: {PartitionID: 2, Low: 10, High: 30},
	}

	req := &ListMessageRequest{
		TopicName:    "test",
		PartitionID:  partitionsAll, // All partitions
		StartOffset:  StartOffsetRecent,
		MessageCount: 3,
	}

	// Expected result should be able to return all 100 requested messages as evenly distributed as possible
	expected := map[int32]*kafka.PartitionConsumeRequest{
		0: {PartitionID: 0, IsDrained: false, StartOffset: marks[0].High - 1, EndOffset: marks[0].High - 1, MaxMessageCount: 1, LowWaterMark: marks[0].Low, HighWaterMark: marks[0].High},
		1: {PartitionID: 1, IsDrained: false, StartOffset: marks[1].High - 1, EndOffset: marks[1].High - 1, MaxMessageCount: 1, LowWaterMark: marks[1].Low, HighWaterMark: marks[1].High},
		2: {PartitionID: 2, IsDrained: false, StartOffset: marks[2].High - 1, EndOffset: marks[2].High - 1, MaxMessageCount: 1, LowWaterMark: marks[2].Low, HighWaterMark: marks[2].High},
	}
	actual, err := svc.calculateConsumeRequests(context.Background(), req, marks)
	require.NoError(t, err)
	assert.Equal(t, expected, actual, "expected other result for unbalanced message distribution - all partition IDs")
}

func TestCalculateConsumeRequests_AllPartitions_Unbalanced(t *testing.T) {
	svc := Service{}
	// Unbalanced message distribution across 3 partitions
	marks := map[int32]*kafka.PartitionMarks{
		0: {PartitionID: 0, Low: 0, High: 300},
		1: {PartitionID: 1, Low: 0, High: 10},
		2: {PartitionID: 2, Low: 10, High: 30},
	}

	req := &ListMessageRequest{
		TopicName:    "test",
		PartitionID:  partitionsAll, // All partitions
		StartOffset:  StartOffsetOldest,
		MessageCount: 100,
	}

	// Expected result should be able to return all 100 requested messages as evenly distributed as possible
	expected := map[int32]*kafka.PartitionConsumeRequest{
		0: {PartitionID: 0, IsDrained: false, LowWaterMark: marks[0].Low, HighWaterMark: marks[0].High, StartOffset: 0, EndOffset: marks[0].High - 1, MaxMessageCount: 70},
		1: {PartitionID: 1, IsDrained: true, LowWaterMark: marks[1].Low, HighWaterMark: marks[1].High, StartOffset: 0, EndOffset: marks[1].High - 1, MaxMessageCount: 10},
		2: {PartitionID: 2, IsDrained: true, LowWaterMark: marks[2].Low, HighWaterMark: marks[2].High, StartOffset: 10, EndOffset: marks[2].High - 1, MaxMessageCount: 20},
	}
	actual, err := svc.calculateConsumeRequests(context.Background(), req, marks)
	require.NoError(t, err)
	assert.Equal(t, expected, actual, "expected other result for unbalanced message distribution - all partition IDs")
}

func TestCalculateConsumeRequests_SinglePartition(t *testing.T) {
	svc := Service{}
	marks := map[int32]*kafka.PartitionMarks{
		14: {PartitionID: 14, Low: 100, High: 300},
	}
	lowMark := marks[14].Low
	highMark := marks[14].High

	tt := []struct {
		req      *ListMessageRequest
		expected map[int32]*kafka.PartitionConsumeRequest
	}{
		// Recent 100 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: StartOffsetRecent, MessageCount: 100},
			map[int32]*kafka.PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: false, StartOffset: highMark - 100, EndOffset: highMark - 1, MaxMessageCount: 100, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Oldest 40 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: StartOffsetOldest, MessageCount: 40},
			map[int32]*kafka.PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: false, StartOffset: lowMark, EndOffset: highMark - 1, MaxMessageCount: 40, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Custom start offset with drained - 50 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: 250, MessageCount: 200},
			map[int32]*kafka.PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: true, StartOffset: 250, EndOffset: highMark - 1, MaxMessageCount: 50, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Custom out of bounds start offset - 50 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: 15, MessageCount: 50},
			map[int32]*kafka.PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: false, StartOffset: lowMark, EndOffset: highMark - 1, MaxMessageCount: 50, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Recent 500 messages with drained
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: StartOffsetRecent, MessageCount: 500},
			map[int32]*kafka.PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: true, StartOffset: lowMark, EndOffset: highMark - 1, MaxMessageCount: 200, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Oldest 500 messages with drained
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: StartOffsetOldest, MessageCount: 500},
			map[int32]*kafka.PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: true, StartOffset: lowMark, EndOffset: highMark - 1, MaxMessageCount: 200, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Newest/Live tail 10 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: StartOffsetNewest, MessageCount: 10},
			map[int32]*kafka.PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: false, StartOffset: -1, EndOffset: math.MaxInt64, MaxMessageCount: 10, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},
	}

	for i, table := range tt {
		actual, err := svc.calculateConsumeRequests(context.Background(), table.req, marks)
		assert.NoError(t, err)
		assert.Equal(t, table.expected, actual, "expected other result for single partition test. Case: ", i)
	}
}

func TestCalculateConsumeRequests_AllPartitions_WithFilter(t *testing.T) {
	svc := Service{}
	// Request less messages than we have partitions, if filter code is set we handle consume requests different than
	// usual - as we don't care about the distribution between partitions.
	marks := map[int32]*kafka.PartitionMarks{
		0: {PartitionID: 0, Low: 0, High: 300},
		1: {PartitionID: 1, Low: 0, High: 300},
		2: {PartitionID: 2, Low: 0, High: 300},
	}

	tt := []struct {
		req      *ListMessageRequest
		expected map[int32]*kafka.PartitionConsumeRequest
	}{
		{

			&ListMessageRequest{
				TopicName:             "test",
				PartitionID:           partitionsAll, // All partitions
				StartOffset:           StartOffsetOldest,
				MessageCount:          2,
				FilterInterpreterCode: "random string that simulates some javascript code",
			},
			map[int32]*kafka.PartitionConsumeRequest{
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
			map[int32]*kafka.PartitionConsumeRequest{
				0: {PartitionID: 0, IsDrained: false, StartOffset: 249, EndOffset: 299, MaxMessageCount: 50, LowWaterMark: 0, HighWaterMark: 300},
				1: {PartitionID: 1, IsDrained: false, StartOffset: 249, EndOffset: 299, MaxMessageCount: 50, LowWaterMark: 0, HighWaterMark: 300},
				2: {PartitionID: 2, IsDrained: false, StartOffset: 249, EndOffset: 299, MaxMessageCount: 50, LowWaterMark: 0, HighWaterMark: 300},
			},
		},
	}

	for i, table := range tt {
		actual, err := svc.calculateConsumeRequests(context.Background(), table.req, marks)
		assert.NoError(t, err)
		assert.Equal(t, table.expected, actual, "expected other result for all partitions with filter enable. Case: ", i)
	}
}
