package owl

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
)

type LogDirsByTopic struct {
	TopicLogDirs   map[string]LogDirTopicSharded
	RequestsSent   int                  `json:"requestsSent"`
	RequestsFailed int                  `json:"requestsFailed"`
	Errors         []BrokerRequestError `json:"errors"`
}

// LogDirTopicSharded contains all log dirs information for a specific topic across all Brokers
type LogDirTopicSharded struct {
	TopicName      string                `json:"topicName"`
	TotalSizeBytes int64                 `json:"totalSizeBytes"`
	BrokerIDs      map[int32]interface{} `json:"-"`
}

// LogDirSizeByTopic returns a map where the Topicname is the key and the summed bytes of all log dirs of
// the respective topic is the value.
func (s *Service) logDirsByTopic(ctx context.Context) (LogDirsByTopic, error) {
	responses, err := s.kafkaSvc.DescribeLogDirs(ctx, nil)
	if err != nil {
		return LogDirsByTopic{}, fmt.Errorf("failed to describe log dirs: %w", err)
	}

	logDirsByTopic := LogDirsByTopic{
		TopicLogDirs:   make(map[string]LogDirTopicSharded),
		RequestsSent:   responses.RequestsSent,
		RequestsFailed: responses.RequestsFailed,
		Errors:         make([]BrokerRequestError, 0),
	}
	for _, res := range responses.LogDirResponses {
		if res.Error != nil {
			logDirsByTopic.Errors = append(logDirsByTopic.Errors, BrokerRequestError{
				BrokerMeta: res.BrokerMetadata,
				Error:      res.Error,
			})
			continue
		}

		for _, logDir := range res.LogDirs.Dirs {
			err := kerr.ErrorForCode(logDir.ErrorCode)
			if err != nil {
				logDirsByTopic.Errors = append(logDirsByTopic.Errors, BrokerRequestError{
					BrokerMeta: res.BrokerMetadata,
					Error:      fmt.Errorf("failed to inspect log dir: %w", err),
				})
				continue
			}

			for _, topic := range logDir.Topics {
				topicLogDir, exists := logDirsByTopic.TopicLogDirs[topic.Topic]
				if !exists {
					topicLogDir = LogDirTopicSharded{
						TopicName:      topic.Topic,
						TotalSizeBytes: 0,
						BrokerIDs:      make(map[int32]interface{}, 0),
					}
				}
				for _, partition := range topic.Partitions {
					topicLogDir.TotalSizeBytes += partition.Size
					topicLogDir.BrokerIDs[res.BrokerMetadata.NodeID] = struct{}{}
				}
				logDirsByTopic.TopicLogDirs[topic.Topic] = topicLogDir
			}
		}
	}

	return logDirsByTopic, nil
}
