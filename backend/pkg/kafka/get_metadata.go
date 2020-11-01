package kafka

import (
	"context"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// GetMetadata returns some generic information about the brokers in the given cluster
func (s *Service) GetMetadata(ctx context.Context) (*kmsg.MetadataResponse, error) {
	req := kmsg.MetadataRequest{
		Topics: []kmsg.MetadataRequestTopic{},
	}

	return req.RequestWith(ctx, s.KafkaClient)
}
