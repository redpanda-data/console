package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"go.uber.org/zap"
	"net/http"
)

// TopicConfig is a TopicName along with all it's config entries
type TopicConfig struct {
	TopicName     string              `json:"topicName"`
	ConfigEntries []*TopicConfigEntry `json:"configEntries"`
	Error         *KafkaError         `json:"error"`
}

// TopicConfigEntry is a key value pair of a config property with it's value
type TopicConfigEntry struct {
	Name        string  `json:"name"`
	Value       *string `json:"value"` // If value is sensitive this will be nil
	IsDefault   bool    `json:"isDefault"`
	IsSensitive bool    `json:"isSensitive"`
}

// GetConfigEntryByName returns the TopicConfigEntry for a given config name (e. g. "cleanup.policy") or nil if
// no config with that name could be found.
func (t *TopicConfig) GetConfigEntryByName(configName string) *TopicConfigEntry {
	for _, entry := range t.ConfigEntries {
		if entry.Name != configName {
			continue
		}
		return entry
	}
	return nil
}

// GetTopicConfigs calls GetTopicsConfigs for a single Topic and returns a single response
func (s *Service) GetTopicConfigs(ctx context.Context, topicName string, configNames []string) (*TopicConfig, *rest.Error) {
	response, err := s.GetTopicsConfigs(ctx, []string{topicName}, configNames)
	if err != nil {
		return nil, &rest.Error{
			Err:      err,
			Status:   http.StatusInternalServerError,
			Message:  fmt.Sprintf("Failed to get topic's config: %v", err.Error()),
			IsSilent: false,
		}
	}

	if val, exists := response[topicName]; exists {
		if val.Error != nil && val.Error.Code == kerr.UnknownTopicOrPartition.Code {
			return nil, &rest.Error{
				Err:      fmt.Errorf("the requested topic does not exist"),
				Status:   http.StatusNotFound,
				Message:  fmt.Sprintf("Could not fetch topic config because the requested topic '%v' does not exist.", topicName),
				IsSilent: false,
			}
		}
	}

	return response[topicName], nil
}

// GetTopicsConfigs fetches all topic config options for the given set of topic names and config names and converts
// that information so that it is handy to use. Provide an empty array for configNames to describe all config entries.
func (s *Service) GetTopicsConfigs(ctx context.Context, topicNames []string, configNames []string) (map[string]*TopicConfig, error) {
	response, err := s.kafkaSvc.DescribeTopicsConfigs(ctx, topicNames, configNames)
	if err != nil {
		return nil, err
	}

	// 3. Iterate through response's config entries and convert them into our desired format
	converted := make(map[string]*TopicConfig, len(topicNames))
	for _, res := range response.Resources {
		kafkaErr := newKafkaError(kerr.ErrorForCode(res.ErrorCode))
		if kafkaErr != nil {
			s.logger.Warn("config resource response has an error", zap.String("resource_name", res.ResourceName), zap.Error(kafkaErr))
		}

		entries := make([]*TopicConfigEntry, len(res.Configs))
		for j, cfg := range res.Configs {
			entries[j] = &TopicConfigEntry{
				Name:        cfg.Name,
				Value:       cfg.Value,
				IsDefault:   cfg.IsDefault,
				IsSensitive: cfg.IsSensitive,
			}
		}

		converted[res.ResourceName] = &TopicConfig{
			TopicName:     res.ResourceName,
			ConfigEntries: entries,
			Error:         kafkaErr,
		}
	}

	return converted, nil
}
