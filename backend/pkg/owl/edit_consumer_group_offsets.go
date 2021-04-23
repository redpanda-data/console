package owl

import (
	"context"
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

type EditConsumerGroupOffsetsResponseTopic struct {
	TopicName  string                                           `json:"topicName"`
	Partitions []EditConsumerGroupOffsetsResponseTopicPartition `json:"partitions"`
}

type EditConsumerGroupOffsetsResponseTopicPartition struct {
	ID    int32  `json:"partitionID"`
	Error string `json:"error,omitempty"`
}

// EditConsumerGroupOffsets edits the group offsets of one or more partitions.
func (s *Service) EditConsumerGroupOffsets(ctx context.Context, groupID string, topics []kmsg.OffsetCommitRequestTopic) ([]EditConsumerGroupOffsetsResponseTopic, *rest.Error) {
	// 1. The provided topic partitions might use special offsets (-2, -1) that need to be resolved to the earliest
	// or oldest offset before sending the edit group request to Kafka.
	topicPartitions := make(map[string][]int32)
	for _, topic := range topics {
		for _, partition := range topic.Partitions {
			topicPartitions[topic.Topic] = append(topicPartitions[topic.Topic], partition.Partition)
		}
	}
	waterMarks, err := s.kafkaSvc.GetPartitionMarksBulk(ctx, topicPartitions)
	if err != nil {
		return nil, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to list topic partitions because partition watermarks couldn't be fetched: %v", err.Error()),
			InternalLogs: nil,
		}
	}
	for _, topic := range topics {
		watermark, topicMarkExists := waterMarks[topic.Topic]
		for _, partition := range topic.Partitions {
			if partition.Offset >= 0 {
				continue
			}

			// Let's replace the special offset (earliest / oldest) with the actual watermark
			if !topicMarkExists {
				return nil, &rest.Error{
					Err:          fmt.Errorf("watermarks for topic '%v' are missing", topic.Topic),
					Status:       http.StatusServiceUnavailable,
					Message:      fmt.Sprintf("Can't substitute earliest/oldest offsets due to missing topic watermarks"),
					InternalLogs: nil,
				}
			}

			partitionMark, exists := watermark[partition.Partition]
			if !exists {
				return nil, &rest.Error{
					Err:          fmt.Errorf("watermarks for topic '%v', partition '%v' are missing", topic.Topic, partition.Partition),
					Status:       http.StatusServiceUnavailable,
					Message:      fmt.Sprintf("Can't substitute earliest/oldest offsets due to missing partition watermarks"),
					InternalLogs: nil,
				}
			}

			switch partition.Offset {
			case kafka.TimestampLatest:
				partition.Offset = partitionMark.High
			case kafka.TimestampEarliest:
				partition.Offset = partitionMark.Low
			}
		}
	}

	// Let's check if
	for _, topic := range topics {
		for _, partition := range topic.Partitions {
			topicPartitions[topic.Topic] = append(topicPartitions[topic.Topic], partition.Partition)
		}
	}

	commitResponse, err := s.kafkaSvc.EditConsumerGroupOffsets(ctx, groupID, topics)
	if err != nil {
		return nil, &rest.Error{
			Err:     err,
			Status:  http.StatusServiceUnavailable,
			Message: fmt.Sprintf("Edit consumer group offsets failed: %v", err.Error()),
		}
	}

	res := make([]EditConsumerGroupOffsetsResponseTopic, len(commitResponse.Topics))
	for i, topic := range commitResponse.Topics {
		partitions := make([]EditConsumerGroupOffsetsResponseTopicPartition, len(topic.Partitions))
		for j, partition := range topic.Partitions {
			err := kerr.ErrorForCode(partition.ErrorCode)
			var errMsg string
			if err != nil {
				errMsg = err.Error()
			}
			partitions[j] = EditConsumerGroupOffsetsResponseTopicPartition{
				ID:    partition.Partition,
				Error: errMsg,
			}
		}
		res[i] = EditConsumerGroupOffsetsResponseTopic{
			TopicName:  topic.Topic,
			Partitions: partitions,
		}
	}

	return res, nil
}
