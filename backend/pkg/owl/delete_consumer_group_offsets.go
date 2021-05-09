package owl

import (
	"context"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

type DeleteConsumerGroupOffsetsResponseTopic struct {
	TopicName  string                                             `json:"topicName"`
	Partitions []DeleteConsumerGroupOffsetsResponseTopicPartition `json:"partitions"`
}

type DeleteConsumerGroupOffsetsResponseTopicPartition struct {
	ID    int32  `json:"partitionID"`
	Error string `json:"error,omitempty"`
}

//
func (s *Service) DeleteConsumerGroupOffsets(ctx context.Context, groupID string, topics []kmsg.OffsetDeleteRequestTopic) ([]DeleteConsumerGroupOffsetsResponseTopic, error) {
	commitResponse, err := s.kafkaSvc.DeleteConsumerGroupOffsets(ctx, groupID, topics)
	if err != nil {
		return nil, err
	}

	res := make([]DeleteConsumerGroupOffsetsResponseTopic, len(commitResponse.Topics))
	for i, topic := range commitResponse.Topics {
		partitions := make([]DeleteConsumerGroupOffsetsResponseTopicPartition, len(topic.Partitions))
		for j, partition := range topic.Partitions {
			err := kerr.ErrorForCode(partition.ErrorCode)
			var errMsg string
			if err != nil {
				errMsg = err.Error()
			}
			partitions[j] = DeleteConsumerGroupOffsetsResponseTopicPartition{
				ID:    partition.Partition,
				Error: errMsg,
			}
		}
		res[i] = DeleteConsumerGroupOffsetsResponseTopic{
			TopicName:  topic.Topic,
			Partitions: partitions,
		}
	}

	return res, nil
}
