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
	"sort"
	"sync"
	"time"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"
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

	// What actions the logged in user is allowed to run on this topic
	AllowedActions []string `json:"allowedActions"`
}

// GetTopicsOverview returns a TopicSummary for all Kafka Topics
func (s *Service) GetTopicsOverview(ctx context.Context) ([]*TopicSummary, error) {
	// 1. Request metadata
	metadata, err := s.kafkaSvc.GetMetadata(ctx, nil)
	if err != nil {
		return nil, err
	}

	// 2. Extract all topicNames from metadata
	topicNames, err := s.GetAllTopicNames(ctx, metadata)
	if err != nil {
		return nil, err
	}

	// 3. Get log dir sizes & configs for each topic concurrently
	// Use a shorter ctx timeout so that we don't wait for too long if one broker is currently down.
	childCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	configs := make(map[string]*TopicConfig)
	wg := sync.WaitGroup{}
	wg.Add(1)
	go func() {
		defer wg.Done()
		configs, err = s.GetTopicsConfigs(childCtx, topicNames, []string{"cleanup.policy"})
		if err != nil {
			s.logger.Warn("failed to fetch topic configs to return cleanup.policy", zap.Error(err))
		}
	}()
	logDirsByTopic := s.logDirsByTopic(childCtx, metadata)
	wg.Wait()

	// 4. Merge information from all requests and construct the TopicSummary object
	res := make([]*TopicSummary, len(topicNames))
	for i, topic := range metadata.Topics {
		policy := "N/A"
		topicName := *topic.Topic
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
		docState := DocumentationStateUnknown
		if !docs.IsEnabled {
			docState = DocumentationStateNotConfigured
		} else if docs.Markdown == nil {
			docState = DocumentationStateNotExistent
		} else {
			docState = DocumentationStateAvailable
		}

		res[i] = &TopicSummary{
			TopicName:         topicName,
			IsInternal:        topic.IsInternal,
			PartitionCount:    len(topic.Partitions),
			ReplicationFactor: len(topic.Partitions[0].Replicas),
			CleanupPolicy:     policy,
			LogDirSummary:     logDirsByTopic[topicName],
			Documentation:     docState,
		}
	}

	// 5. Return map as array which is sorted by topic name
	sort.Slice(res, func(i, j int) bool {
		return res[i].TopicName < res[j].TopicName
	})

	return res, nil
}

// GetAllTopicNames returns all topic names from the metadata. You can either pass the metadata response into
// this method (to avoid duplicate requests) or let the function request the metadata.
func (s *Service) GetAllTopicNames(ctx context.Context, metadata *kmsg.MetadataResponse) ([]string, error) {
	if metadata == nil {
		var err error
		metadata, err = s.kafkaSvc.GetMetadata(ctx, nil)
		if err != nil {
			return nil, err
		}
	}

	topicNames := make([]string, len(metadata.Topics))
	for i, topic := range metadata.Topics {
		topicName := *topic.Topic
		err := kerr.ErrorForCode(topic.ErrorCode)
		if err != nil {
			s.logger.Error("failed to get topic metadata while listing topics",
				zap.String("topic_name", topicName),
				zap.Error(err))
			return nil, err
		}

		topicNames[i] = topicName
	}

	return topicNames, nil
}
