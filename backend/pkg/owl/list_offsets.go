package owl

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
)

type TopicOffset struct {
	TopicName  string            `json:"topicName"`
	Partitions []PartitionOffset `json:"partitions"`
}

type PartitionOffset struct {
	Error       string `json:"error,omitempty"`
	PartitionID int32  `json:"partitionId"`
	Offset      int64  `json:"offset"`
	Timestamp   int64  `json:"timestamp"`
}

func (s *Service) ListOffsets(ctx context.Context, topicNames []string, timestamp int64) ([]TopicOffset, error) {
	metadata, err := s.kafkaSvc.GetMetadata(ctx, topicNames)
	if err != nil {
		return nil, fmt.Errorf("failed to request partition info for topics")
	}

	topicPartitions := make(map[string][]int32, len(metadata.Topics))
	for _, topic := range metadata.Topics {
		err := kerr.ErrorForCode(topic.ErrorCode)
		if err != nil {
			return nil, fmt.Errorf("failed to request partition info for topic '%v': %w", topic.Topic, err)
		}

		for _, partition := range topic.Partitions {
			err := kerr.ErrorForCode(partition.ErrorCode)
			if err != nil {
				return nil, fmt.Errorf("failed to request partition info for topic '%v', partition: '%v': %w", topic.Topic, partition.Partition, err)
			}
			topicPartitions[topic.Topic] = append(topicPartitions[topic.Topic], partition.Partition)
		}
	}
	kres, err := s.kafkaSvc.ListOffsets(ctx, topicPartitions, timestamp)
	if err != nil {
		return nil, err
	}

	offsetResponses := make([]TopicOffset, len(kres.Topics))
	for i, topic := range kres.Topics {
		pOffsets := make([]PartitionOffset, len(topic.Partitions))
		for j, partition := range topic.Partitions {
			err := kerr.ErrorForCode(partition.ErrorCode)
			if err != nil {
				pOffsets[j] = PartitionOffset{
					Error:       err.Error(),
					PartitionID: partition.Partition,
					Offset:      partition.Offset,
				}
			}

			pOffsets[j] = PartitionOffset{
				PartitionID: partition.Partition,
				Offset:      partition.Offset,
				Timestamp:   partition.Timestamp,
			}
		}
		offsetResponses[i] = TopicOffset{
			TopicName:  topic.Topic,
			Partitions: pOffsets,
		}
	}

	return offsetResponses, nil
}
