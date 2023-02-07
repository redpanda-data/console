// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/kversion"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

// OverviewKafka is the cluster information we retrieve from or about the
// Kafka API.
type OverviewKafka struct {
	OverviewStatus
	// Version is the version that we guess via the Kafka API.
	Version string `json:"version,omitempty"`
	// Distribution is the software flavour (Apache Kafka, Redpanda, ...)
	Distribution    *KafkaDistribution    `json:"distribution,omitempty"`
	BrokersOnline   int                   `json:"brokersOnline,omitempty"`
	BrokersExpected int                   `json:"brokersExpected,omitempty"`
	TopicsCount     int                   `json:"topicsCount,omitempty"`
	PartitionsCount int                   `json:"partitionsCount,omitempty"`
	ReplicasCount   int                   `json:"replicasCount,omitempty"`
	ControllerID    int32                 `json:"controllerId"`
	Brokers         []OverviewKafkaBroker `json:"brokers"`

	Authorizer *OverviewKafkaAuthorizer `json:"authorizer,omitempty"`
}

// OverviewKafkaBroker is the metadata for brokers that are part of a cluster.
type OverviewKafkaBroker struct {
	BrokerID int32   `json:"brokerId"`
	Address  string  `json:"address"`
	Rack     *string `json:"rack,omitempty"`
}

// OverviewKafkaAuthorizer contains all information around the Kafka Authorizer.
// If we failed to retrieve the information we return a request error.
type OverviewKafkaAuthorizer struct {
	RequestError        string `json:"requestError,omitempty"`
	IsAuthorizerEnabled bool   `json:"isAuthorizerEnabled,omitempty"`
	ACLCount            int    `json:"aclCount,omitempty"`
}

// getKafkaOverview coordinates multiple Kafka requests to return OverviewKafka.
func (s *Service) getKafkaOverview(ctx context.Context) OverviewKafka {
	// We use a child context with a shorter timeout because otherwise we'll potentially have very long response
	// times in case of a single broker being down.
	childCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	grp, grpCtx := errgroup.WithContext(childCtx)

	// Fetch cluster metadata
	var metadata *kmsg.MetadataResponse
	grp.Go(func() error {
		var err error
		metadata, err = s.kafkaSvc.GetMetadata(ctx, nil)
		return err
	})

	// Fetch Kafka API version
	clusterVersion := "unknown"
	grp.Go(func() error {
		var err error

		clusterVersion, err = s.GetKafkaVersion(childCtx)
		if err != nil {
			s.logger.Warn("failed to request kafka version", zap.Error(err))
		}

		return nil
	})

	// Retrieve ACL information
	var authorizer OverviewKafkaAuthorizer
	grp.Go(func() error {
		authorizer = s.getOverviewKafkaAuthorizer(grpCtx)
		return nil
	})

	if err := grp.Wait(); err != nil {
		// Only the metadata request would return an error here, all others are optional
		return OverviewKafka{
			OverviewStatus: OverviewStatus{
				Status:       StatusTypeUnhealthy,
				StatusReason: fmt.Sprintf("Failed to retrieve metadata from cluster: %v", err.Error()),
			},
		}
	}

	partitionCount := 0
	replicaCount := 0
	for _, t := range metadata.Topics {
		if t.ErrorCode != 0 {
			continue
		}
		for _, p := range t.Partitions {
			if p.ErrorCode != 0 {
				continue
			}
			partitionCount += 1
			replicaCount += len(p.Replicas)
		}
	}

	distribution := distributionFromMetadata(metadata)
	overviewBrokers := make([]OverviewKafkaBroker, len(metadata.Brokers))
	for i, broker := range metadata.Brokers {
		overviewBrokers[i] = OverviewKafkaBroker{
			BrokerID: broker.NodeID,
			Address:  broker.Host,
			Rack:     broker.Rack,
		}
	}

	return OverviewKafka{
		OverviewStatus:  s.statusFromMetadata(metadata),
		Version:         clusterVersion,
		Distribution:    &distribution,
		BrokersOnline:   len(metadata.Brokers),
		BrokersExpected: len(expectedBrokersFromMetadata(metadata)),
		Brokers:         overviewBrokers,
		TopicsCount:     len(metadata.Topics),
		PartitionsCount: partitionCount,
		ReplicasCount:   replicaCount,
		Authorizer:      &authorizer,
	}
}

func (s *Service) getOverviewKafkaAuthorizer(ctx context.Context) OverviewKafkaAuthorizer {
	listAllReq := kmsg.NewDescribeACLsRequest()
	listAllReq.ResourcePatternType = kmsg.ACLResourcePatternTypeAny
	listAllReq.Operation = kmsg.ACLOperationAny
	listAllReq.PermissionType = kmsg.ACLPermissionTypeAny
	listAllReq.ResourceType = kmsg.ACLResourceTypeAny
	aclOverview, err := s.ListAllACLs(ctx, listAllReq)
	if err != nil {
		return OverviewKafkaAuthorizer{
			RequestError: err.Error(),
		}
	}
	return OverviewKafkaAuthorizer{
		IsAuthorizerEnabled: aclOverview.IsAuthorizerEnabled,
		ACLCount:            len(aclOverview.ACLResources),
	}
}

// distributionFromMetadata tries to derive the Kafka
func distributionFromMetadata(metadata *kmsg.MetadataResponse) KafkaDistribution {
	if metadata == nil {
		return KafkaDistributionUnknown
	}

	if metadata.ClusterID == nil {
		return KafkaDistributionApacheKafka
	}

	if strings.HasPrefix(*metadata.ClusterID, "redpanda.") {
		return KafkaDistributionRedpanda
	}

	return KafkaDistributionApacheKafka
}

// expectedBrokersFromMetadata returns a map of brokerIDs that host at least one
// replica and thus are expected to be part of this cluster.
func expectedBrokersFromMetadata(metadata *kmsg.MetadataResponse) map[int32]struct{} {
	if metadata == nil {
		return nil
	}

	expectedBrokers := make(map[int32]struct{})
	for _, b := range metadata.Brokers {
		expectedBrokers[b.NodeID] = struct{}{}
	}
	for _, t := range metadata.Topics {
		if t.ErrorCode != 0 {
			continue
		}
		for _, p := range t.Partitions {
			if p.ErrorCode != 0 {
				continue
			}
			for _, replicaID := range p.Replicas {
				expectedBrokers[replicaID] = struct{}{}
			}
		}
	}

	return expectedBrokers
}

// statusFromMetadata tries to derive a cluster status from the metadata response,
// by looking at each partition and their replicas.
// We may return:
// - Healthy: if all partitions and replicas are online & in-sync
// - Degraded: if at least one partition is under-replicated or has no leader
// - Unhealthy: if metadata does not exist or if at least one partition is not writable
// (e.g. too few ISR or too many offline replicas)
//
//nolint:gocognit,cyclop // If it grows further, we should probably break it up into multiple functions
func (s *Service) statusFromMetadata(metadata *kmsg.MetadataResponse) OverviewStatus {
	if metadata == nil {
		return OverviewStatus{
			Status:       StatusTypeUnhealthy,
			StatusReason: "Failed to fetch metadata from cluster",
		}
	}

	// Start with a healthy status which we can downgrade to something less healthy
	// using OverviewStatus.SetStatus().
	status := OverviewStatus{
		Status:       StatusTypeHealthy,
		StatusReason: "",
	}

	onlineBrokers := make(map[int32]kmsg.MetadataResponseBroker)
	for _, b := range metadata.Brokers {
		onlineBrokers[b.NodeID] = b
	}
	expectedBrokers := expectedBrokersFromMetadata(metadata)

	if len(expectedBrokers) > len(onlineBrokers) {
		status.SetStatus(
			StatusTypeDegraded,
			fmt.Sprintf("Expected %v online brokers which host replicas, but only %v are online",
				expectedBrokers,
				onlineBrokers),
		)
	}

	// Iterate on all partitions & replicas to derive a health state based on
	// missing partition leaders, under-replicated partitions or offline replicas.
	var lastErr error
	var errorCount int
	var partitionLeadersNotAvailable int
	var underReplicatedPartitions int
	var unwritablePartitions int // Only partitions with RF >= 2
	for _, t := range metadata.Topics {
		if err := kerr.ErrorForCode(t.ErrorCode); err != nil {
			lastErr = err
			errorCount++
			continue
		}
		for _, p := range t.Partitions {
			if err := kerr.ErrorForCode(p.ErrorCode); err != nil {
				if errors.Is(err, kerr.LeaderNotAvailable) {
					partitionLeadersNotAvailable++
				} else {
					lastErr = err
					errorCount++
					continue
				}
			}
			// Only with more than one replica users can assume some sort of high availability
			if len(p.Replicas) == 1 {
				continue
			}

			if len(p.ISR) < len(p.Replicas) {
				underReplicatedPartitions++
			}

			// This math has the assumption that the topic's min.isr setting is always set to
			// replication factor - 1. If you have RF=3 but min.isr=1 the topic is still
			// writable if two brokers are offline. We neglect that fact here though.
			maxOfflineReplicas := len(p.Replicas) / 2
			if len(p.OfflineReplicas) > maxOfflineReplicas || len(p.ISR) < maxOfflineReplicas {
				unwritablePartitions++
			}
		}
	}

	if partitionLeadersNotAvailable > 0 {
		status.SetStatus(StatusTypeDegraded,
			fmt.Sprintf("The leaders of %v partitions are currently unavailable. Leaders may be unavailable for "+
				"various reasons, including a leader reelection.", partitionLeadersNotAvailable))
	}
	if underReplicatedPartitions > 0 {
		status.SetStatus(StatusTypeDegraded,
			fmt.Sprintf("The cluster has %v partitions that are under-replicated.", underReplicatedPartitions))
	}
	if unwritablePartitions > 0 {
		if underReplicatedPartitions > 0 {
			status.SetStatus(StatusTypeUnhealthy,
				fmt.Sprintf("The cluster has %v partitions that are replicated, but are currently unwritable. "+
					"Partitions may be unwritable because they are under-replicated or its replicas are offline.)",
					underReplicatedPartitions))
		}
	}

	if errorCount > 0 {
		s.logger.Warn("failed to iterate over some topics or partitions to derive cluster status",
			zap.Int("error_count", errorCount),
			zap.Error(lastErr))
	}

	return status
}

// GetKafkaVersion extracts the guessed Apache Kafka version based on the reported
// API versions for each API key.
func (s *Service) GetKafkaVersion(ctx context.Context) (string, error) {
	apiVersions, err := s.kafkaSvc.GetAPIVersions(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to request api versions: %w", err)
	}

	err = kerr.ErrorForCode(apiVersions.ErrorCode)
	if err != nil {
		return "", fmt.Errorf("failed to request api versions. Inner Kafka error: %w", err)
	}

	versions := kversion.FromApiVersionsResponse(apiVersions)

	return versions.VersionGuess(), nil
}
