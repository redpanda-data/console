package kafka

import (
	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

// TopicDescription is a TopicName along with all it's config entries
type TopicDescription struct {
	TopicName     string              `json:"topicName"`
	ConfigEntries []*TopicConfigEntry `json:"configEntries"`
}

// TopicConfigEntry is a key value pair of a config property with it's value
type TopicConfigEntry struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	IsDefault bool   `json:"isDefault"`
}

// DescribeTopicConfigs fetches all topic config options for a given topic name
func (s *Service) DescribeTopicConfigs(topicName string) (*TopicDescription, error) {
	response, err := s.DescribeTopicsConfigs([]string{topicName})
	if err != nil {
		return nil, err
	}

	return response[0], nil
}

// DescribeTopicsConfigs fetches all topic config options for the given set of topic names
func (s *Service) DescribeTopicsConfigs(topicNames []string) ([]*TopicDescription, error) {
	// 1. Create request object
	resources := make([]*sarama.ConfigResource, len(topicNames))
	for i, topicName := range topicNames {
		r := &sarama.ConfigResource{
			Type: sarama.TopicResource,
			Name: topicName,
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

	// 3. Iterate through response's config entries and convert them into our desired format
	converted := make([]*TopicDescription, len(topicNames))
	for i, res := range response.Resources {
		if res.ErrorMsg != "" {
			s.Logger.Error("config response resource has an error", zap.String("resource_name", res.Name), zap.Error(err))
			return nil, err
		}

		entries := make([]*TopicConfigEntry, len(res.Configs))
		for j, cfg := range res.Configs {
			entries[j] = &TopicConfigEntry{
				Name:      cfg.Name,
				Value:     cfg.Value,
				IsDefault: cfg.Default,
			}
		}

		converted[i] = &TopicDescription{
			TopicName:     res.Name,
			ConfigEntries: entries,
		}
	}

	return converted, nil
}
