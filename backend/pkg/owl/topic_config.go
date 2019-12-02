package owl

import "go.uber.org/zap"

// TopicConfigs is a TopicName along with all it's config entries
type TopicConfigs struct {
	TopicName     string              `json:"topicName"`
	ConfigEntries []*TopicConfigEntry `json:"configEntries"`
}

// TopicConfigEntry is a key value pair of a config property with it's value
type TopicConfigEntry struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	IsDefault bool   `json:"isDefault"`
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
func (s *Service) GetTopicConfigs(topicName string, configNames []string) (*TopicConfigs, error) {
	response, err := s.GetTopicsConfigs([]string{topicName}, configNames)
	if err != nil {
		return nil, err
	}

	return response[topicName], nil
}

// GetTopicsConfigs fetches all topic config options for the given set of topic names and config names and converts
// that information so that it is handy to use. Provide an empty array for configNames to describe all config entries.
func (s *Service) GetTopicsConfigs(topicNames []string, configNames []string) (map[string]*TopicConfigs, error) {
	response, err := s.KafkaSvc.DescribeTopicsConfigs(topicNames, configNames)
	if err != nil {
		return nil, err
	}

	// 3. Iterate through response's config entries and convert them into our desired format
	converted := make(map[string]*TopicConfigs, len(topicNames))
	for _, res := range response.Resources {
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

		converted[res.Name] = &TopicConfigs{
			TopicName:     res.Name,
			ConfigEntries: entries,
		}
	}

	return converted, nil
}
