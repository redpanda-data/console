// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// TopicConfig is a TopicName along with all it's config entries
type TopicConfig struct {
	TopicName     string              `json:"topicName"`
	ConfigEntries []*TopicConfigEntry `json:"configEntries"`
	Error         *KafkaError         `json:"error"`
}

// TopicConfigEntry is a key value pair of a config property with it's value
type TopicConfigEntry struct {
	Name            string               `json:"name"`
	Value           *string              `json:"value"` // If value is sensitive this will be nil
	Source          string               `json:"source"`
	Type            string               `json:"type"`
	IsExplicitlySet bool                 `json:"isExplicitlySet"`
	IsDefaultValue  bool                 `json:"isDefaultValue"`
	IsSensitive     bool                 `json:"isSensitive"`
	IsReadOnly      bool                 `json:"isReadOnly"`
	Documentation   *string              `json:"documentation"` // Will be nil for Kafka <v2.6.0
	Synonyms        []TopicConfigSynonym `json:"synonyms"`

	ConfigEntryExtension
}

// NewTopicConfigEntry creates a new instance for a TopicConfigEntry. The function
// is in charge of computing additional properties based on existing other
// properties, as well as enriching the giving describe configs response with
// properties from our own config extensions.
func NewTopicConfigEntry(
	cfg kmsg.DescribeConfigsResponseResourceConfig,
	extension ConfigEntryExtension,
) *TopicConfigEntry {
	isDefaultValue := false
	innerEntries := make([]TopicConfigSynonym, len(cfg.ConfigSynonyms))
	for j, innerCfg := range cfg.ConfigSynonyms {
		innerEntries[j] = TopicConfigSynonym{
			Name:   innerCfg.Name,
			Value:  innerCfg.Value,
			Source: innerCfg.Source.String(),
		}
		if innerCfg.Source == kmsg.ConfigSourceDefaultConfig {
			isDefaultValue = derefString(cfg.Value) == derefString(innerCfg.Value)
		}
	}

	var isExplicitlySet bool
	if cfg.Source == kmsg.ConfigSourceUnknown {
		// Kafka <v1.1 uses the IsDefault property. Since then, it's been replaced by ConfigSource and defaults
		// to false. Thus, we only consider it if cfg.Source is not set / unknown.
		isExplicitlySet = !cfg.IsDefault
	} else {
		isExplicitlySet = cfg.Source == kmsg.ConfigSourceDynamicTopicConfig
	}

	documentation := cfg.Documentation
	if documentation == nil {
		documentation = extension.Documentation
	}
	configType := cfg.ConfigType
	if configType == kmsg.ConfigTypeUnknown {
		configType = extension.Type
	}
	extension.FrontendFormat = FrontendFormatFromValueType(configType, extension.FrontendFormat)

	return &TopicConfigEntry{
		Name:                 cfg.Name,
		Value:                cfg.Value,
		Source:               cfg.Source.String(),
		Type:                 configType.String(),
		IsExplicitlySet:      isExplicitlySet,
		IsDefaultValue:       isDefaultValue,
		IsSensitive:          cfg.IsSensitive,
		IsReadOnly:           cfg.ReadOnly,
		Documentation:        documentation,
		Synonyms:             innerEntries,
		ConfigEntryExtension: extension,
	}
}

// TopicConfigSynonym is a synonym for a topic configuration.
type TopicConfigSynonym struct {
	Name   string  `json:"name"`
	Value  *string `json:"value"`
	Source string  `json:"source"`
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
				Err:      errors.New("the requested topic does not exist"),
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
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}

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

	response, err := req.RequestWith(ctx, cl)
	if err != nil {
		return nil, err
	}

	// 3. Iterate through response's config entries and convert them into our desired format
	converted := make(map[string]*TopicConfig, len(topicNames))
	for _, res := range response.Resources {
		kafkaErr := newKafkaError(res.ErrorCode)
		if kafkaErr != nil {
			s.logger.WarnContext(ctx, "config resource response has an error", slog.String("resource_name", res.ResourceName), slog.Any("error", kafkaErr))
		}

		entries := make([]*TopicConfigEntry, len(res.Configs))
		for i, cfg := range res.Configs {
			// Merge config extension into entry
			extension := s.configExtensionsByName[cfg.Name]
			entries[i] = NewTopicConfigEntry(cfg, extension)
		}

		converted[res.ResourceName] = &TopicConfig{
			TopicName:     res.ResourceName,
			ConfigEntries: entries,
			Error:         kafkaErr,
		}
	}

	return converted, nil
}
