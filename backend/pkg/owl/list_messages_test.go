package owl

import (
	"github.com/Shopify/sarama"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestCalculateConsumeRequests_AllPartitions_FewNewestMessages(t *testing.T) {
	// Request less messages than we have partitions
	marks := map[int32]*kafka.WaterMark{
		0: {PartitionID: 0, Low: 0, High: 300},
		1: {PartitionID: 1, Low: 0, High: 10},
		2: {PartitionID: 2, Low: 10, High: 30},
	}

	req := &ListMessageRequest{
		TopicName:    "test",
		PartitionID:  partitionsAll, // All partitions
		StartOffset:  sarama.OffsetNewest,
		MessageCount: 3,
	}

	// Expected result should be able to return all 100 requested messages as evenly distributed as possible
	expected := map[int32]*kafka.PartitionConsumeRequest{
		0: {PartitionID: 0, IsDrained: false, StartOffset: marks[0].High - 1, EndOffset: marks[0].High - 1, MaxMessageCount: 1, LowWaterMark: marks[0].Low, HighWaterMark: marks[0].High},
		1: {PartitionID: 1, IsDrained: false, StartOffset: marks[1].High - 1, EndOffset: marks[1].High - 1, MaxMessageCount: 1, LowWaterMark: marks[1].Low, HighWaterMark: marks[1].High},
		2: {PartitionID: 2, IsDrained: false, StartOffset: marks[2].High - 1, EndOffset: marks[2].High - 1, MaxMessageCount: 1, LowWaterMark: marks[2].Low, HighWaterMark: marks[2].High},
	}
	actual := calculateConsumeRequests(req, marks)

	assert.Equal(t, expected, actual, "expected other result for unbalanced message distribution - all partition IDs")
}

func TestCalculateConsumeRequests_AllPartitions_Unbalanced(t *testing.T) {
	// Unbalanced message distribution across 3 partitions
	marks := map[int32]*kafka.WaterMark{
		0: {PartitionID: 0, Low: 0, High: 300},
		1: {PartitionID: 1, Low: 0, High: 11},
		2: {PartitionID: 2, Low: 10, High: 31},
	}

	req := &ListMessageRequest{
		TopicName:    "test",
		PartitionID:  partitionsAll, // All partitions
		StartOffset:  sarama.OffsetOldest,
		MessageCount: 100,
	}

	// Expected result should be able to return all 100 requested messages as evenly distributed as possible
	expected := map[int32]*kafka.PartitionConsumeRequest{
		0: {PartitionID: 0, IsDrained: false, LowWaterMark: marks[0].Low, HighWaterMark: marks[0].High, StartOffset: 0, EndOffset: marks[0].High - 1, MaxMessageCount: 70},
		1: {PartitionID: 1, IsDrained: true, LowWaterMark: marks[1].Low, HighWaterMark: marks[1].High, StartOffset: 0, EndOffset: marks[1].High - 1, MaxMessageCount: 10},
		2: {PartitionID: 2, IsDrained: true, LowWaterMark: marks[2].Low, HighWaterMark: marks[2].High, StartOffset: 10, EndOffset: marks[2].High - 1, MaxMessageCount: 20},
	}
	actual := calculateConsumeRequests(req, marks)

	assert.Equal(t, expected, actual, "expected other result for unbalanced message distribution - all partition IDs")
}

func TestCalculateConsumeRequests_SinglePartition(t *testing.T) {
	marks := map[int32]*kafka.WaterMark{
		14: {PartitionID: 14, Low: 100, High: 301},
	}
	lowMark := marks[14].Low
	highMark := marks[14].High

	tt := []struct {
		req      *ListMessageRequest
		expected map[int32]*kafka.PartitionConsumeRequest
	}{
		// Newest 100 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: sarama.OffsetNewest, MessageCount: 100},
			map[int32]*kafka.PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: false, StartOffset: highMark - 100, EndOffset: highMark - 1, MaxMessageCount: 100, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Oldest 40 messages
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: sarama.OffsetOldest, MessageCount: 40},
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

		// Newest 500 messages with drained
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: sarama.OffsetNewest, MessageCount: 500},
			map[int32]*kafka.PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: true, StartOffset: lowMark, EndOffset: highMark - 1, MaxMessageCount: 201, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},

		// Oldest 500 messages with drained
		{
			&ListMessageRequest{TopicName: "test", PartitionID: 14, StartOffset: sarama.OffsetOldest, MessageCount: 500},
			map[int32]*kafka.PartitionConsumeRequest{
				14: {PartitionID: 14, IsDrained: true, StartOffset: lowMark, EndOffset: highMark - 1, MaxMessageCount: 200, LowWaterMark: lowMark, HighWaterMark: highMark},
			},
		},
	}

	for i, table := range tt {
		actual := calculateConsumeRequests(table.req, marks)
		assert.Equal(t, table.expected, actual, "expected other result for single partition test. Case: ", i)
	}
}
