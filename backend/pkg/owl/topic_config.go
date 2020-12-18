package owl

import (
	"context"
	"github.com/twmb/franz-go/pkg/kerr"
	"go.uber.org/zap"
)

// TopicConfigs is a TopicName along with all it's config entries
type TopicConfigs struct {
	TopicName     string              `json:"topicName"`
	ConfigEntries []*TopicConfigEntry `json:"configEntries"`
}

// TopicConfigEntry is a key value pair of a config property with it's value
type TopicConfigEntry struct {
	Name        string  `json:"name"`
	Value       *string `json:"value"` // If value is sensitiv this will be nil
	IsDefault   bool    `json:"isDefault"`
	IsSensitive bool    `json:"isSensitive"`
}

// GetConfigEntryByName returns the TopicConfigEntry for a given config name (e. g. "cleanup.policy") or nil if
// no config with that name could be found.
func (t *TopicConfigs) GetConfigEntryByName(configName string) *TopicConfigEntry {
	for _, entry := range t.ConfigEntries {
		if entry.Name != configName {
			continue
		}
		return entry
	}
	return nil
}

// GetTopicConfigs calls GetTopicsConfigs for a single Topic and returns a single response
func (s *Service) GetTopicConfigs(ctx context.Context, topicName string, configNames []string) (*TopicConfigs, error) {
	response, err := s.GetTopicsConfigs(ctx, []string{topicName}, configNames)
	if err != nil {
		return nil, err
	}

	return response[topicName], nil
}

// GetTopicsConfigs fetches all topic config options for the given set of topic names and config names and converts
// that information so that it is handy to use. Provide an empty array for configNames to describe all config entries.
func (s *Service) GetTopicsConfigs(ctx context.Context, topicNames []string, configNames []string) (map[string]*TopicConfigs, error) {
	response, err := s.kafkaSvc.DescribeTopicsConfigs(ctx, topicNames, configNames)
	if err != nil {
		return nil, err
	}

	// 3. Iterate through response's config entries and convert them into our desired format
	converted := make(map[string]*TopicConfigs, len(topicNames))
	for _, res := range response.Resources {
		err := kerr.ErrorForCode(res.ErrorCode)
		if err != nil {
			s.logger.Error("config response resource has an error", zap.String("resource_name", res.ResourceName), zap.Error(err))
			return nil, err
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

		converted[res.ResourceName] = &TopicConfigs{
			TopicName:     res.ResourceName,
			ConfigEntries: entries,
		}
	}

	return converted, nil
}
