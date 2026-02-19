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
	"slices"
	"sort"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kadm"
)

// ConsumerGroupOverview for a Kafka Consumer Group
type ConsumerGroupOverview struct {
	GroupID       string                   `json:"groupId"`
	GroupType     string                   `json:"groupType"` // "classic" or "consumer" (KIP-848)
	State         string                   `json:"state"`
	ProtocolType  string                   `json:"protocolType"`
	Protocol      string                   `json:"protocol"`
	Members       []GroupMemberDescription `json:"members"`
	CoordinatorID int32                    `json:"coordinatorId"`
	TopicOffsets  []GroupTopicOffsets      `json:"topicOffsets"`
}

// GroupMemberDescription is a member (e. g. connected host) of a Consumer Group
type GroupMemberDescription struct {
	ID          string                  `json:"id"`
	ClientID    string                  `json:"clientId"`
	ClientHost  string                  `json:"clientHost"`
	Assignments []GroupMemberAssignment `json:"assignments"`
}

// GroupMemberAssignment represents a partition assignment for a group member
type GroupMemberAssignment struct {
	TopicName    string  `json:"topicName"`
	PartitionIDs []int32 `json:"partitionIds"`
}

// GetConsumerGroupsOverview returns a ConsumerGroupOverview for all available consumer groups.
// Pass nil for groupIDs if you want to fetch all available groups.
// Supports both classic groups (DescribeGroups API) and KIP-848 consumer groups (DescribeConsumerGroups API).
func (s *Service) GetConsumerGroupsOverview(ctx context.Context, groupIDs []string) ([]ConsumerGroupOverview, *rest.Error) {
	_, adminCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, errorToRestError(err)
	}
	groups, err := adminCl.ListGroups(ctx)
	if err != nil {
		return nil, &rest.Error{
			Err:      fmt.Errorf("failed to list consumer groups: %w", err),
			Status:   http.StatusInternalServerError,
			Message:  "Failed to list consumer groups",
			IsSilent: false,
		}
	}

	allGroupIDs := groups.Groups()
	if groupIDs != nil {
		allGroupIDs = groupIDs
		// Validate requested group IDs exist in the cluster
		clusterGroups := groups.Groups()
		for _, id := range groupIDs {
			if !slices.Contains(clusterGroups, id) {
				return nil, &rest.Error{
					Err:      fmt.Errorf("requested group id '%v' does not exist in Kafka cluster", id),
					Status:   http.StatusNotFound,
					Message:  fmt.Sprintf("Requested group id '%v' does not exist in Kafka cluster", id),
					IsSilent: false,
				}
			}
		}
	}

	// Split groups by type: classic vs consumer (KIP-848)
	consumerGroupIDs := s.listConsumerTypeGroups(ctx, adminCl, allGroupIDs)
	classicGroupIDs := make([]string, 0)
	for _, id := range allGroupIDs {
		if !slices.Contains(consumerGroupIDs, id) {
			classicGroupIDs = append(classicGroupIDs, id)
		}
	}

	// Describe classic groups
	var classicOverviews []ConsumerGroupOverview
	if len(classicGroupIDs) > 0 {
		describedClassic, err := adminCl.DescribeGroups(ctx, classicGroupIDs...)
		if err != nil {
			var se *kadm.ShardErrors
			if !errors.As(err, &se) {
				return nil, errorToRestError(err)
			}
			if se.AllFailed {
				return nil, errorToRestError(err)
			}
			s.logger.WarnContext(ctx, "failed to describe classic consumer groups from some shards", slog.Int("failed_shards", len(se.Errs)))
			for _, shardErr := range se.Errs {
				s.logger.WarnContext(ctx, "shard error for describing classic consumer groups",
					slog.Int("broker_id", int(shardErr.Broker.NodeID)),
					slog.Any("error", shardErr.Err))
			}
		}
		classicOverviews = s.convertKgoGroupDescriptions(describedClassic, make(map[string][]GroupTopicOffsets))
	}

	// Describe consumer (KIP-848) groups
	var consumerOverviews []ConsumerGroupOverview
	explicitConsumerRequest := groupIDs != nil && len(consumerGroupIDs) > 0
	if len(consumerGroupIDs) > 0 {
		describedConsumer, err := adminCl.DescribeConsumerGroups(ctx, consumerGroupIDs...)
		if err != nil {
			if explicitConsumerRequest {
				return nil, &rest.Error{
					Err:      fmt.Errorf("failed to describe KIP-848 consumer groups: %w", err),
					Status:   http.StatusInternalServerError,
					Message:  "Failed to describe consumer groups",
					IsSilent: false,
				}
			}
			s.logger.WarnContext(ctx, "failed to describe KIP-848 consumer groups, skipping", slog.Any("error", err))
		} else {
			if describedConsumer.Error() != nil {
				s.logger.WarnContext(ctx, "partial failure describing KIP-848 consumer groups", slog.Any("error", describedConsumer.Error()))
			}
			// Always convert successful groups; convertDescribedConsumerGroups skips per-group errors
			consumerOverviews = s.convertDescribedConsumerGroups(describedConsumer, make(map[string][]GroupTopicOffsets))
		}
	}

	// For explicit requests, ensure all requested consumer groups were successfully described
	if explicitConsumerRequest {
		describedSet := make(map[string]struct{})
		for _, o := range consumerOverviews {
			describedSet[o.GroupID] = struct{}{}
		}
		for _, id := range consumerGroupIDs {
			if _, ok := describedSet[id]; !ok {
				return nil, &rest.Error{
					Err:      fmt.Errorf("requested consumer group '%v' could not be described", id),
					Status:   http.StatusNotFound,
					Message:  fmt.Sprintf("Requested consumer group '%v' could not be described", id),
					IsSilent: false,
				}
			}
		}
	}

	// Merge results and fetch offsets for all groups
	allOverviews := append(classicOverviews, consumerOverviews...)
	groupIDsForOffsets := make([]string, len(allOverviews))
	for i, o := range allOverviews {
		groupIDsForOffsets[i] = o.GroupID
	}
	groupLags, err := s.getConsumerGroupOffsets(ctx, adminCl, groupIDsForOffsets)
	if err != nil {
		return nil, &rest.Error{
			Err:      fmt.Errorf("failed to get consumer group lags: %w", err),
			Status:   http.StatusNotFound,
			Message:  fmt.Sprintf("Failed to get consumer group lags: %v", err.Error()),
			IsSilent: false,
		}
	}

	for i := range allOverviews {
		allOverviews[i].TopicOffsets = groupLags[allOverviews[i].GroupID]
	}

	sort.Slice(allOverviews, func(i, j int) bool { return allOverviews[i].GroupID < allOverviews[j].GroupID })
	return allOverviews, nil
}

// listConsumerTypeGroups returns group IDs that are KIP-848 "consumer" type.
// On failure (e.g. older Kafka), returns empty slice and all groups are treated as classic.
func (s *Service) listConsumerTypeGroups(ctx context.Context, adminCl *kadm.Client, filterGroupIDs []string) []string {
	listed, err := adminCl.ListGroupsByType(ctx, []string{"consumer"})
	if err != nil {
		s.logger.WarnContext(ctx, "ListGroupsByType(consumer) not supported or failed, treating all groups as classic", slog.Any("error", err))
		return nil
	}
	consumerIDs := listed.Groups()
	if len(filterGroupIDs) == 0 {
		return consumerIDs
	}
	filterSet := make(map[string]struct{})
	for _, id := range filterGroupIDs {
		filterSet[id] = struct{}{}
	}
	filtered := make([]string, 0)
	for _, id := range consumerIDs {
		if _, ok := filterSet[id]; ok {
			filtered = append(filtered, id)
		}
	}
	return filtered
}

// convertDescribedConsumerGroups converts kadm.DescribedConsumerGroups to []ConsumerGroupOverview.
func (s *Service) convertDescribedConsumerGroups(described kadm.DescribedConsumerGroups, offsets map[string][]GroupTopicOffsets) []ConsumerGroupOverview {
	if offsets == nil {
		offsets = make(map[string][]GroupTopicOffsets)
	}
	result := make([]ConsumerGroupOverview, 0)
	for _, group := range described.Sorted() {
		if group.Err != nil {
			s.logger.Warn("failed to describe KIP-848 consumer group",
				slog.String("group_id", group.Group),
				slog.Int("coordinator_id", int(group.Coordinator.NodeID)))
			continue
		}

		result = append(result, ConsumerGroupOverview{
			GroupID:       group.Group,
			GroupType:     "consumer",
			State:         group.State,
			ProtocolType:  "consumer",
			Protocol:      "",
			Members:       s.convertConsumerGroupMembers(group.Members),
			CoordinatorID: group.Coordinator.NodeID,
			TopicOffsets:  offsets[group.Group],
		})
	}
	return result
}

// convertConsumerGroupMembers converts KIP-848 ConsumerGroupMember to GroupMemberDescription.
// ConsumerGroupMember has Assignment.TopicPartitions (topic -> partitions) directly.
func (s *Service) convertConsumerGroupMembers(members []kadm.ConsumerGroupMember) []GroupMemberDescription {
	response := make([]GroupMemberDescription, 0)
	for _, m := range members {
		convertedAssignments := make([]GroupMemberAssignment, 0)
		m.Assignment.Each(func(t string, p int32) {
			// Each is called per partition; we need to group by topic
			found := false
			for i := range convertedAssignments {
				if convertedAssignments[i].TopicName == t {
					convertedAssignments[i].PartitionIDs = append(convertedAssignments[i].PartitionIDs, p)
					found = true
					break
				}
			}
			if !found {
				convertedAssignments = append(convertedAssignments, GroupMemberAssignment{
					TopicName:    t,
					PartitionIDs: []int32{p},
				})
			}
		})
		sort.Slice(convertedAssignments, func(i, j int) bool {
			return convertedAssignments[i].TopicName < convertedAssignments[j].TopicName
		})
		for i := range convertedAssignments {
			sort.Slice(convertedAssignments[i].PartitionIDs, func(a, b int) bool {
				return convertedAssignments[i].PartitionIDs[a] < convertedAssignments[i].PartitionIDs[b]
			})
		}
		response = append(response, GroupMemberDescription{
			ID:          m.MemberID,
			ClientID:    m.ClientID,
			ClientHost:  m.ClientHost,
			Assignments: convertedAssignments,
		})
	}
	return response
}

func (s *Service) convertKgoGroupDescriptions(describedGroups kadm.DescribedGroups, offsets map[string][]GroupTopicOffsets) []ConsumerGroupOverview {
	result := make([]ConsumerGroupOverview, 0)
	for _, group := range describedGroups.Sorted() {
		if group.Err != nil {
			s.logger.Warn("failed to describe consumer group",
				slog.String("group_id", group.Group),
				slog.Int("coordinator_id", int(group.Coordinator.NodeID)))
			continue
		}

		result = append(result, ConsumerGroupOverview{
			GroupID:       group.Group,
			GroupType:     "classic",
			State:         group.State,
			ProtocolType:  group.ProtocolType,
			Protocol:      group.Protocol,
			Members:       s.convertGroupMembers(group.Members),
			CoordinatorID: group.Coordinator.NodeID,
			TopicOffsets:  offsets[group.Group],
		})
	}

	return result
}

func (*Service) convertGroupMembers(members []kadm.DescribedGroupMember) []GroupMemberDescription {
	response := make([]GroupMemberDescription, 0)

	for _, m := range members {
		// MemberAssignments is a byte array which will be set by kafka clients. All clients which use protocol
		// type "consumer" are supposed to follow a schema which we will try to parse below. If the protocol type
		// is different we won't even try to deserialize the byte array as this will likely fail.
		//
		// Confluent's Schema registry for instance does not follow that schema and does therefore set a different
		// protocol type.
		// see: https://cwiki.apache.org/confluence/display/KAFKA/A+Guide+To+The+Kafka+Protocol

		// Try to decode Group member assignments
		convertedAssignments := make([]GroupMemberAssignment, 0)

		consumerAssignment, ok := m.Assigned.AsConsumer()
		if ok {
			for _, topic := range consumerAssignment.Topics {
				convertedAssignments = append(convertedAssignments, GroupMemberAssignment{
					TopicName:    topic.Topic,
					PartitionIDs: topic.Partitions,
				})
			}
		}

		// Sort all assignments by topicname
		sort.Slice(convertedAssignments, func(i, j int) bool {
			return convertedAssignments[i].TopicName < convertedAssignments[j].TopicName
		})

		response = append(response, GroupMemberDescription{
			ID:          m.MemberID,
			ClientID:    m.ClientID,
			ClientHost:  m.ClientHost,
			Assignments: convertedAssignments,
		})
	}

	return response
}
