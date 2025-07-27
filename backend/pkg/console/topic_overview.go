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
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"
)

// DocumentationState denotes whether topic documentation is available for a certain
// topic. If it is not available it also provides additional information why it's not available.
type DocumentationState string

const (
	// DocumentationStateUnknown is the default documentation state.
	DocumentationStateUnknown DocumentationState = "UNKNOWN"
	// DocumentationStateNotConfigured is the state if Redpanda Console was not configured to
	// run with topic documentations (i.e. it has no source to pull documentations from).
	DocumentationStateNotConfigured = "NOT_CONFIGURED"
	// DocumentationStateNotExistent denotes that topic documentation is configured, but
	// for this specific topic there's no documentation available.
	DocumentationStateNotExistent = "NOT_EXISTENT"
	// DocumentationStateAvailable denotes that documentation for this topic is available.
	DocumentationStateAvailable = "AVAILABLE"
)

// TopicSummary is all information we get when listing Kafka topics
type TopicSummary struct {
	TopicName         string             `json:"topicName"`
	IsInternal        bool               `json:"isInternal"`
	PartitionCount    int                `json:"partitionCount"`
	ReplicationFactor int                `json:"replicationFactor"`
	CleanupPolicy     string             `json:"cleanupPolicy"`
	Documentation     DocumentationState `json:"documentation"`
	LogDirSummary     TopicLogDirSummary `json:"logDirSummary"`
}

// GetTopicsOverview returns a TopicSummary for all Kafka Topics
//
//nolint:gocognit // This function is complex by nature as it has to fetch multiple information from Kafka
func (s *Service) GetTopicsOverview(ctx context.Context) ([]*TopicSummary, error) {
	_, adminCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}

	// 1. Request metadata
	metadata, err := adminCl.Metadata(ctx)
	if err != nil {
		return nil, err
	}

	// 2. Extract all topicNames from metadata
	topicNames := make([]string, 0, len(metadata.Topics))
	for _, topic := range metadata.Topics {
		topicName := topic.Topic
		if topic.Err != nil {
			s.logger.ErrorContext(ctx, "failed to get topic metadata while listing topics",
				slog.String("topic_name", topicName),
				slog.Any("error", topic.Err))
			return nil, topic.Err
		}

		topicNames = append(topicNames, topicName)
	}

	// 3. Get log dir sizes & configs for each topic concurrently
	// Use a shorter ctx timeout so that we don't wait for too long if one broker is currently down.
	childCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	configs := make(map[string]*TopicConfig)
	var logDirsByTopic map[string]TopicLogDirSummary
	var logDirErrorMsg string
	wg := sync.WaitGroup{}
	wg.Add(2)
	go func() {
		defer wg.Done()
		configs, err = s.GetTopicsConfigs(childCtx, topicNames, []string{"cleanup.policy"})
		if err != nil {
			s.logger.Warn("failed to fetch topic configs to return cleanup.policy", slog.Any("error", err))
		}
	}()
	go func() {
		defer wg.Done()
		logDirs, err := s.logDirsByTopic(childCtx)
		if err == nil {
			logDirsByTopic = logDirs
		} else {
			s.logger.Warn("failed to retrieve log dirs by topic", slog.Any("error", err))
			logDirErrorMsg = err.Error()
		}
	}()
	wg.Wait()

	// 4. Merge information from all requests and construct the TopicSummary object
	res := make([]*TopicSummary, 0, len(topicNames))
	for _, topic := range metadata.Topics {
		policy := "N/A"
		topicName := topic.Topic
		if configs != nil {
			// Configs might be nil if we don't have the required Kafka ACLs to get topic configs.
			if val, ok := configs[topicName]; ok {
				entry := val.GetConfigEntryByName("cleanup.policy")
				if entry != nil {
					// This should be safe to dereference as only sensitive values will be nil
					policy = *(entry.Value)
				}
			}
		}

		docs := s.GetTopicDocumentation(topicName)
		var docState DocumentationState
		if !docs.IsEnabled {
			docState = DocumentationStateNotConfigured
		} else {
			if docs.Markdown == nil {
				docState = DocumentationStateNotExistent
			} else {
				docState = DocumentationStateAvailable
			}
		}

		// Set dummy response in case of an error when describing metadata or log dirs
		// If we have a topic log dir summary for the given topic we will return that.
		logDirSummary := TopicLogDirSummary{
			TotalSizeBytes: -1,
			Hint:           fmt.Sprintf("Failed to describe log dirs: %v", logDirErrorMsg),
		}
		if logDirsByTopic != nil {
			if sum, exists := logDirsByTopic[topicName]; exists {
				logDirSummary = sum
			}
		}

		res = append(res, &TopicSummary{
			TopicName:         topicName,
			IsInternal:        topic.IsInternal,
			PartitionCount:    len(topic.Partitions),
			ReplicationFactor: len(topic.Partitions[0].Replicas),
			CleanupPolicy:     policy,
			LogDirSummary:     logDirSummary,
			Documentation:     docState,
		})
	}

	// 5. Return map as array which is sorted by topic name
	sort.Slice(res, func(i, j int) bool {
		return res[i].TopicName < res[j].TopicName
	})

	return res, nil
}

// GetAllTopicNames returns all topic names from the metadata. You can either pass the metadata response into
// this method (to avoid duplicate requests) or let the function request the metadata.
func (s *Service) GetAllTopicNames(ctx context.Context) ([]string, error) {
	_, adminCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}

	metadata, err := adminCl.Metadata(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch topic metadata: %w", err)
	}
	if err := metadata.Topics.Error(); err != nil {
		return nil, fmt.Errorf("failed to fetch topic metadata: %w", err)
	}

	return metadata.Topics.Names(), nil
}
