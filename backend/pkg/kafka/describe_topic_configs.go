package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"
)

// DescribeTopicsConfigs fetches all topic config options for the given set of topic names and config names.
// Use nil for configNames to fetch all configs.
func (s *Service) DescribeTopicsConfigs(ctx context.Context, topicNames []string, configNames []string) (*kmsg.DescribeConfigsResponse, error) {
	resources := make([]kmsg.DescribeConfigsRequestResource, len(topicNames))
	for i, topicName := range topicNames {
		r := kmsg.DescribeConfigsRequestResource{
			ResourceType: kmsg.ConfigResourceTypeTopic,
			ResourceName: topicName,
			ConfigNames:  configNames,
		}
		resources[i] = r
	}

	req := kmsg.NewDescribeConfigsRequest()
	req.Resources = resources
	req.IncludeDocumentation = true
	req.IncludeSynonyms = true

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		s.Logger.Error("could not describe topic configs", zap.Error(err))
		return nil, fmt.Errorf("failed to request topic configs: %w", err)
	}

	return res, nil
}
