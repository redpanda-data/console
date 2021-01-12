package owl

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
)

// PartitionReassignments
type PartitionReassignments struct {
	TopicName  string                            `json:"topicName"`
	Partitions []PartitionReassignmentsPartition `json:"partitions"`
}

// PartitionReassignments
type PartitionReassignmentsPartition struct {
	PartitionID      int32   `json:"partitionId"`
	AddingReplicas   []int32 `json:"addingReplicas"`
	RemovingReplicas []int32 `json:"removingReplicas"`
	Replicas         []int32 `json:"replicas"`
}

// ListPartitionReassignments returns all partition reassignments that are currently in progress.
func (s *Service) ListPartitionReassignments(ctx context.Context) ([]PartitionReassignments, error) {
	reassignments, err := s.kafkaSvc.ListPartitionReassignments(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list partition reassignments: %w", err)
	}

	err = kerr.ErrorForCode(reassignments.ErrorCode)
	if err != nil {
		return nil, fmt.Errorf("failed to list partition reassignments. Inner error: %w", err)
	}

	topicReassignments := make([]PartitionReassignments, 0)
	for _, topic := range reassignments.Topics {
		partitionAssignments := make([]PartitionReassignmentsPartition, 0)
		for _, partition := range topic.Partitions {
			partitionAssignments = append(partitionAssignments, PartitionReassignmentsPartition{
				PartitionID:      partition.Partition,
				AddingReplicas:   partition.AddingReplicas,
				RemovingReplicas: partition.RemovingReplicas,
				Replicas:         partition.RemovingReplicas,
			})
		}

		topicReassignments = append(topicReassignments, PartitionReassignments{
			TopicName:  topic.Topic,
			Partitions: partitionAssignments,
		})
	}

	return topicReassignments, nil
}
