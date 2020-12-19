package owl

import (
	"context"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

type EditConsumerGroupOffsetsResponse struct {
	Topics []EditConsumerGroupOffsetsResponseTopic `json:"topics"`
}

type EditConsumerGroupOffsetsResponseTopic struct {
	TopicName  string                                           `json:"topicName"`
	Partitions []EditConsumerGroupOffsetsResponseTopicPartition `json:"partitions"`
}

type EditConsumerGroupOffsetsResponseTopicPartition struct {
	ID    int32 `json:"partitionID"`
	Error error `json:"error"`
}

//
func (s *Service) EditConsumerGroupOffsets(ctx context.Context, groupID string, topics []kmsg.OffsetCommitRequestTopic) (*EditConsumerGroupOffsetsResponse, error) {
	commitResponse, err := s.kafkaSvc.EditConsumerGroupOffsets(ctx, groupID, topics)
	if err != nil {
		return nil, err
	}

	res := &EditConsumerGroupOffsetsResponse{
		Topics: make([]EditConsumerGroupOffsetsResponseTopic, len(commitResponse.Topics)),
	}
	for i, topic := range commitResponse.Topics {
		partitions := make([]EditConsumerGroupOffsetsResponseTopicPartition, len(topic.Partitions))
		for j, partition := range topic.Partitions {
			partitions[j] = EditConsumerGroupOffsetsResponseTopicPartition{
				ID:    partition.Partition,
				Error: kerr.ErrorForCode(partition.ErrorCode),
			}
		}
		res.Topics[i] = EditConsumerGroupOffsetsResponseTopic{
			TopicName:  topic.Topic,
			Partitions: partitions,
		}
	}

	return res, nil
}
