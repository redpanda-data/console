package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// DescribeBrokerConfig fetches config entries which apply at the Broker Scope (e.g. offset.retention.minutes).
// Use nil for configNames in order to get all config entries.
func (s *Service) DescribeBrokerConfig(ctx context.Context, brokerID string, configNames []string) ([]kmsg.DescribeConfigsResponseResource, error) {
	brokerConfigsRequest := kmsg.DescribeConfigsRequestResource{
		ResourceType: 4,           // Broker
		ResourceName: brokerID,    // Empty string for all brokers (only works for dynamic broker configs)
		ConfigNames:  configNames, // Nil requests all
	}
	req := kmsg.DescribeConfigsRequest{
		Resources: []kmsg.DescribeConfigsRequestResource{
			brokerConfigsRequest,
		},
		IncludeSynonyms:      true,
		IncludeDocumentation: true,
	}
	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("failed to request broker config: %w", err)
	}

	return res.Resources, nil
}
