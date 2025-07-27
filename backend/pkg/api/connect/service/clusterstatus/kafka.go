// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package clusterstatus

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"

	consolev1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

// kafkaStatusChecker encapsulates the logic to derive Kafka cluster status.
type kafkaStatusChecker struct {
	logger *slog.Logger
}

// statusFromMetadata computes the health status from Kafka metadata.
func (k *kafkaStatusChecker) statusFromMetadata(metadata kadm.Metadata) *consolev1alpha1.ComponentStatus {
	// Start with a healthy status; it can be downgraded based on findings.
	status := &consolev1alpha1.ComponentStatus{
		Status:       consolev1alpha1.StatusType_STATUS_TYPE_HEALTHY,
		StatusReason: "",
	}

	// Determine online brokers from metadata.
	onlineBrokers := make(map[int32]kadm.BrokerDetail, len(metadata.Brokers))
	for _, broker := range metadata.Brokers {
		onlineBrokers[broker.NodeID] = broker
	}

	// Get brokers that are expected to be online.
	expectedBrokers := k.getExpectedBrokers(metadata)
	if len(expectedBrokers) > len(onlineBrokers) {
		setStatus(status, consolev1alpha1.StatusType_STATUS_TYPE_DEGRADED,
			fmt.Sprintf("Expected %v online brokers which host replicas, but only %v are online",
				len(expectedBrokers), len(onlineBrokers)),
		)
	}

	// Initialize counters for partition health.
	var (
		lastError                    error
		errorCount                   int
		partitionLeadersNotAvailable int
		underReplicatedPartitions    int
		unwritablePartitions         int
	)

	// Check for topic-level errors.
	metadata.Topics.EachError(func(topic kadm.TopicDetail) {
		lastError = topic.Err
		errorCount++
	})

	// Check each partition for various health issues.
	metadata.Topics.EachPartition(func(partition kadm.PartitionDetail) {
		if partition.Err != nil {
			if !errors.Is(partition.Err, kerr.LeaderNotAvailable) {
				lastError = partition.Err
				errorCount++
				return
			}
			partitionLeadersNotAvailable++
		}

		// Skip replication checks if there's only one replica.
		if len(partition.Replicas) <= 1 {
			return
		}

		if len(partition.ISR) < len(partition.Replicas) {
			underReplicatedPartitions++
		}

		// Calculate max allowed offline replicas.
		maxOfflineReplicas := len(partition.Replicas) / 2
		if len(partition.OfflineReplicas) > maxOfflineReplicas || len(partition.ISR) < maxOfflineReplicas {
			unwritablePartitions++
		}
	})

	// Set degraded status based on the issues found.
	if partitionLeadersNotAvailable > 0 {
		setStatus(status, consolev1alpha1.StatusType_STATUS_TYPE_DEGRADED,
			fmt.Sprintf("The leaders of %v partitions are currently unavailable. Leaders may be unavailable for various reasons, including a leader reelection.", partitionLeadersNotAvailable))
	}
	if underReplicatedPartitions > 0 {
		setStatus(status, consolev1alpha1.StatusType_STATUS_TYPE_DEGRADED,
			fmt.Sprintf("The cluster has %v partitions that are under-replicated.", underReplicatedPartitions))
	}
	if unwritablePartitions > 0 {
		setStatus(status, consolev1alpha1.StatusType_STATUS_TYPE_DEGRADED,
			fmt.Sprintf("The cluster has %v partitions that are unwritable. Partitions may be unwritable because they are under-replicated or their replicas are offline.", unwritablePartitions))
	}

	// Log any errors encountered during iteration.
	if errorCount > 0 {
		k.logger.Warn("failed to iterate over some topics or partitions to derive cluster status",
			slog.Int("error_count", errorCount),
			slog.Any("error", lastError))
	}

	return status
}

// getExpectedBrokers returns a set of broker IDs that are expected to be online,
// either because they are directly in the brokers list or host at least one replica.
func (*kafkaStatusChecker) getExpectedBrokers(metadata kadm.Metadata) map[int32]struct{} {
	brokers := make(map[int32]struct{}, len(metadata.Brokers))
	for _, broker := range metadata.Brokers {
		brokers[broker.NodeID] = struct{}{}
	}

	metadata.Topics.EachPartition(func(partition kadm.PartitionDetail) {
		if partition.Err != nil {
			return
		}
		for _, replicaID := range partition.Replicas {
			brokers[replicaID] = struct{}{}
		}
	})

	return brokers
}

// distributionFromMetadata tries to derive the Kafka distribution based on the
// cluster id we retrieve via the metadata.
func (*kafkaStatusChecker) distributionFromMetadata(metadata kadm.Metadata) consolev1alpha1.KafkaDistribution {
	if metadata.Cluster == "" {
		return consolev1alpha1.KafkaDistribution_KAFKA_DISTRIBUTION_UNKNOWN
	}

	if strings.HasPrefix(metadata.Cluster, "redpanda.") {
		return consolev1alpha1.KafkaDistribution_KAFKA_DISTRIBUTION_REDPANDA
	}

	return consolev1alpha1.KafkaDistribution_KAFKA_DISTRIBUTION_APACHE_KAFKA
}

func (*kafkaStatusChecker) brokersFromMetadata(metadata kadm.Metadata) []*consolev1alpha1.KafkaBroker {
	brokersProto := make([]*consolev1alpha1.KafkaBroker, len(metadata.Brokers))
	for i, broker := range metadata.Brokers {
		brokersProto[i] = &consolev1alpha1.KafkaBroker{
			BrokerId: broker.NodeID,
			Host:     broker.Host,
			RackId:   broker.Rack,
		}
	}
	return brokersProto
}
