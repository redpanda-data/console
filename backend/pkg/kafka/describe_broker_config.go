package kafka

import (
	"context"
	"github.com/twmb/franz-go/pkg/kmsg"
	"strconv"
)

// DescribeBrokerConfig fetches config entries which apply at the Broker Scope (e.g. offset.retention.minutes).
// Use nil for configNames in order to get all config entries.
func (s *Service) DescribeBrokerConfig(ctx context.Context, brokerID int32, configNames []string) (*kmsg.DescribeConfigsResponse, error) {
	resourceReq := kmsg.NewDescribeConfigsRequestResource()
	resourceReq.ResourceType = kmsg.ConfigResourceTypeBroker
	resourceReq.ResourceName = strconv.Itoa(int(brokerID)) // Empty string for all brokers (only works for dynamic broker configs)
	resourceReq.ConfigNames = configNames                  // Nil requests all

	req := kmsg.NewDescribeConfigsRequest()
	req.Resources = []kmsg.DescribeConfigsRequestResource{
		resourceReq,
	}
	req.IncludeSynonyms = true
	req.IncludeDocumentation = true

	return req.RequestWith(ctx, s.KafkaClient)
}
