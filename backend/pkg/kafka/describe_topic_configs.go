package kafka

import (
	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

// DescribeTopicsConfigs fetches all topic config options for the given set of topic names and config names.
// Use an empty array for configNames to fetch all configs.
func (s *Service) DescribeTopicsConfigs(topicNames []string, configNames []string) (*sarama.DescribeConfigsResponse, error) {
	// 1. Create request object
	resources := make([]*sarama.ConfigResource, len(topicNames))
	for i, topicName := range topicNames {
		r := &sarama.ConfigResource{
			Type:        sarama.TopicResource,
			Name:        topicName,
			ConfigNames: configNames,
		}
		resources[i] = r
	}
	req := &sarama.DescribeConfigsRequest{
		Resources: resources,
	}

	// 2. Send/receive request and check for errors
	b, err := s.Client.Controller()
	if err != nil {
		s.Logger.Error("could not get cluster controller broker", zap.Error(err))
		return nil, err
	}
	response, err := b.DescribeConfigs(req)
	if err != nil {
		s.Logger.Error("could not describe topic configs", zap.Error(err))
		return nil, err
	}

	return response, nil
}
