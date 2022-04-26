package kafka

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kmsg"
)

func (s *Service) CreateTopic(ctx context.Context, createTopicReq kmsg.CreateTopicsRequestTopic) (*kmsg.CreateTopicsResponseTopic, error) {
	req := kmsg.NewCreateTopicsRequest()
	req.Topics = []kmsg.CreateTopicsRequestTopic{createTopicReq}

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("request has failed: %w", err)
	}
	if len(res.Topics) != 1 {
		return nil, fmt.Errorf("unexpected number of topic responses, expected exactly one but got '%v'", len(res.Topics))
	}

	return &res.Topics[0], nil
}
