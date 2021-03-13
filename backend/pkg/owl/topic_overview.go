package owl

import (
	"context"
	"github.com/twmb/franz-go/pkg/kerr"
	"sort"
	"time"

	"go.uber.org/zap"
)

// TopicSummary is all information we get when listing Kafka topics
type TopicSummary struct {
	TopicName         string             `json:"topicName"`
	IsInternal        bool               `json:"isInternal"`
	PartitionCount    int                `json:"partitionCount"`
	ReplicationFactor int                `json:"replicationFactor"`
	CleanupPolicy     string             `json:"cleanupPolicy"`
	LogDirSummary     TopicLogDirSummary `json:"logDirSummary"`

	// What actions the logged in user is allowed to run on this topic
	AllowedActions []string `json:"allowedActions"`
}

// GetTopicsOverview returns a TopicSummary for all Kafka Topics
func (s *Service) GetTopicsOverview(ctx context.Context) ([]*TopicSummary, error) {
	metadata, err := s.kafkaSvc.GetMetadata(ctx, nil)
	if err != nil {
		return nil, err
	}
	topicNames := make([]string, len(metadata.Topics))
	for i, topic := range metadata.Topics {
		err := kerr.ErrorForCode(topic.ErrorCode)
		if err != nil {
			s.logger.Error("failed to get topic metadata while listing topics",
				zap.String("topic_name", topic.Topic),
				zap.Error(err))
			return nil, err
		}

		topicNames[i] = topic.Topic
	}

	// 3. Get log dir sizes for each topic
	// Use a shorter ctx timeout so that we don't wait for too long if one broker is currently down.
	logDirCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	logDirsByTopic := s.logDirsByTopic(logDirCtx, metadata)
	if err != nil {
		return nil, err
	}

	// 3. Create config resources request objects for all topics
	configs, err := s.GetTopicsConfigs(ctx, topicNames, []string{"cleanup.policy"})
	if err != nil {
		s.logger.Warn("failed to fetch topic configs to return cleanup.policy", zap.Error(err))
	}

	// 4. Merge information from all requests and construct the TopicSummary object
	res := make([]*TopicSummary, len(topicNames))
	for i, topic := range metadata.Topics {
		policy := "N/A"
		if configs != nil {
			// Configs might be nil if we don't have the required Kafka ACLs to get topic configs.
			if val, ok := configs[topic.Topic]; ok {
				entry := val.GetConfigEntryByName("cleanup.policy")
				if entry != nil {
					// This should be safe to dereference as only sensitive values will be nil
					policy = *(entry.Value)
				}
			}
		}

		res[i] = &TopicSummary{
			TopicName:         topic.Topic,
			IsInternal:        topic.IsInternal,
			PartitionCount:    len(topic.Partitions),
			ReplicationFactor: len(topic.Partitions[0].Replicas),
			CleanupPolicy:     policy,
			LogDirSummary:     logDirsByTopic[topic.Topic],
		}
	}

	// 5. Return map as array which is sorted by topic name
	sort.Slice(res, func(i, j int) bool {
		return res[i].TopicName < res[j].TopicName
	})

	return res, nil
}
