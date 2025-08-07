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

// GetConsumerGroupsOverview returns a ConsumerGroupOverview for all available consumer groups
// Pass nil for groupIDs if you want to fetch all available groups.
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

	if groupIDs == nil {
		groupIDs = groups.Groups()
	} else {
		// Not existent consumer groups will be reported as "dead" by Kafka. We would like to report them as 404 instead.
		// Hence we'll check if the passed group IDs exist in the response
		for _, id := range groupIDs {
			exists := slices.Contains(groupIDs, id)
			if !exists {
				return nil, &rest.Error{
					Err:      fmt.Errorf("requested group id '%v' does not exist in Kafka cluster", id),
					Status:   http.StatusNotFound,
					Message:  fmt.Sprintf("Requested group id '%v' does not exist in Kafka cluster", id),
					IsSilent: false,
				}
			}
		}
	}

	describedGroups, err := adminCl.DescribeGroups(ctx, groupIDs...)
	if err != nil {
		var se *kadm.ShardErrors
		if !errors.As(err, &se) {
			return nil, errorToRestError(err)
		}

		if se.AllFailed {
			return nil, errorToRestError(err)
		}
		s.logger.WarnContext(ctx, "failed to describe consumer groups from some shards", slog.Int("failed_shards", len(se.Errs)))
		for _, shardErr := range se.Errs {
			s.logger.WarnContext(ctx, "shard error for describing consumer groups",
				slog.Int("broker_id", int(shardErr.Broker.NodeID)),
				slog.Any("error", shardErr.Err))
		}
	}

	groupLags, err := s.getConsumerGroupOffsets(ctx, adminCl, describedGroups.Names())
	if err != nil {
		return nil, &rest.Error{
			Err:      fmt.Errorf("failed to get consumer group lags: %w", err),
			Status:   http.StatusNotFound,
			Message:  fmt.Sprintf("Failed to get consumer group lags: %v", err.Error()),
			IsSilent: false,
		}
	}

	res := s.convertKgoGroupDescriptions(describedGroups, groupLags)
	sort.Slice(res, func(i, j int) bool { return res[i].GroupID < res[j].GroupID })

	return res, nil
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
