package kafka

import (
	"context"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func (s *Service) IncrementalAlterConfigs(ctx context.Context, alterConfigs []kmsg.IncrementalAlterConfigsRequestResource) (*kmsg.IncrementalAlterConfigsResponse, error) {
	req := kmsg.NewIncrementalAlterConfigsRequest()
	req.Resources = alterConfigs

	return req.RequestWith(ctx, s.KafkaClient)
}
