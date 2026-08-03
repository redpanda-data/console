// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package topic

import (
	"github.com/redpanda-data/console/backend/pkg/console"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

// consoleMapper maps console topic summaries to the Console v1alpha1 proto types.
type consoleMapper struct{}

func (k *consoleMapper) topicSummariesToProto(summaries []*console.TopicSummary) []*v1alpha1.ListTopicsResponse_Topic {
	topics := make([]*v1alpha1.ListTopicsResponse_Topic, len(summaries))
	for i, summary := range summaries {
		topics[i] = k.topicSummaryToProto(summary)
	}

	return topics
}

func (k *consoleMapper) topicSummaryToProto(summary *console.TopicSummary) *v1alpha1.ListTopicsResponse_Topic {
	return &v1alpha1.ListTopicsResponse_Topic{
		Name:              summary.TopicName,
		Internal:          summary.IsInternal,
		PartitionCount:    int32(summary.PartitionCount),
		ReplicationFactor: int32(summary.ReplicationFactor),
		CleanupPolicy:     summary.CleanupPolicy,
		LogDirSummary:     k.topicLogDirSummaryToProto(summary.LogDirSummary),
	}
}

func (*consoleMapper) topicLogDirSummaryToProto(summary console.TopicLogDirSummary) *v1alpha1.ListTopicsResponse_LogDirSummary {
	replicaErrors := make([]*v1alpha1.ListTopicsResponse_ReplicaError, len(summary.ReplicaErrors))
	for i, replicaError := range summary.ReplicaErrors {
		replicaErrors[i] = &v1alpha1.ListTopicsResponse_ReplicaError{
			BrokerId: replicaError.BrokerID,
			Error:    replicaError.Error,
		}
	}

	return &v1alpha1.ListTopicsResponse_LogDirSummary{
		TotalSizeBytes: summary.TotalSizeBytes,
		ReplicaErrors:  replicaErrors,
		Hint:           summary.Hint,
	}
}
