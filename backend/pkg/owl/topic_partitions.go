package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kmsg"
	"net/http"
)

// TopicPartition consists of some (not all) information about a partition of a topic.
// Only data relevant to the 'partition table' in the frontend is included.
type TopicPartition struct {
	ID            int32 `json:"id"`
	WaterMarkLow  int64 `json:"waterMarkLow"`
	WaterMarkHigh int64 `json:"waterMarkHigh"`

	// Replicas returns all broker IDs containing replicas of this partition.
	Replicas []int32 `json:"replicas"`

	// OfflineReplicas, proposed in KIP-112 and introduced in Kafka 1.0,
	// returns all offline broker IDs that should be replicating this partition.
	OfflineReplicas []int32 `json:"offlineReplicas"`

	// InSyncReplicas returns all broker IDs of in-sync replicas of this partition.
	InSyncReplicas []int32 `json:"inSyncReplicas"`

	// Leader is the broker leader for this partition. This will be -1 on leader / listener error.
	Leader int32 `json:"leader"`
}

// ListTopicPartitions returns the partition in the topic along with their watermarks
func (s *Service) ListTopicPartitions(ctx context.Context, topicName string) ([]TopicPartition, *rest.Error) {
	metadata, restErr := s.kafkaSvc.GetSingleMetadata(ctx, topicName)
	if restErr != nil {
		return nil, restErr
	}

	partitionsByID := make(map[int32]kmsg.MetadataResponseTopicPartition)
	partitionIDs := make([]int32, len(metadata.Partitions))
	for i, partition := range metadata.Partitions {
		partitionIDs[i] = partition.Partition
		partitionsByID[partition.Partition] = partition
	}

	// Get watermarks
	waterMarks, err := s.kafkaSvc.GetPartitionMarks(ctx, topicName, partitionIDs)
	if err != nil {
		return nil, &rest.Error{
			Err:          err,
			Status:       http.StatusInternalServerError,
			Message:      fmt.Sprintf("Failed to list topic partitions because partition watermarks couldn't be fetched: %v", err.Error()),
			InternalLogs: nil,
		}
	}

	// Create result array
	topicPartitions := make([]TopicPartition, len(metadata.Partitions))
	for i, p := range metadata.Partitions {
		w := waterMarks[p.Partition]
		topicPartitions[i] = TopicPartition{
			ID:              p.Partition,
			WaterMarkLow:    w.Low,
			WaterMarkHigh:   w.High,
			Replicas:        p.Replicas,
			OfflineReplicas: p.OfflineReplicas,
			InSyncReplicas:  p.ISR,
			Leader:          p.Leader,
		}
	}

	return topicPartitions, nil
}
