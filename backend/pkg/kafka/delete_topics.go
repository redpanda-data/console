package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func (s *Service) DeleteTopics(ctx context.Context, topicNames []string) (*kmsg.DeleteTopicsResponse, error) {
	req := kmsg.NewDeleteTopicsRequest()
	req.TopicNames = topicNames

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("failed to delete topics: %w", err)
	}

	return res, nil
}
