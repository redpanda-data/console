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
	"fmt"
	"net/http"
	"sort"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/kafka"
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

	// AllowedActions define the Kowl Business permissions on this specific group
	AllowedActions []string `json:"allowedActions"`
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
	groups, err := s.kafkaSvc.ListConsumerGroups(ctx)
	if err != nil {
		return nil, &rest.Error{
			Err:      fmt.Errorf("failed to list consumer groups: %w", err),
			Status:   http.StatusInternalServerError,
			Message:  "Failed to list consumer groups",
			IsSilent: false,
		}
	}

	if groupIDs == nil {
		groupIDs = groups.GetGroupIDs()
	} else {
		// Not existent consumer groups will be reported as "dead" by Kafka. We would like to report them as 404 instead.
		// Hence we'll check if the passed group IDs exist in the response
		for _, id := range groupIDs {
			_, exists := find(groups.GetGroupIDs(), id)
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

	describedGroupsSharded, err := s.kafkaSvc.DescribeConsumerGroups(ctx, groupIDs)
	if err != nil {
		return nil, &rest.Error{
			Err:      fmt.Errorf("failed to describe consumer groups: %w", err),
			Status:   http.StatusNotFound,
			Message:  fmt.Sprintf("Failed to describe consumer groups: %v", err.Error()),
			IsSilent: false,
		}
	}

	groupLags, err := s.getConsumerGroupOffsets(ctx, describedGroupsSharded.GetGroupIDs())
	if err != nil {
		return nil, &rest.Error{
			Err:      fmt.Errorf("failed to get consumer group lags: %w", err),
			Status:   http.StatusNotFound,
			Message:  fmt.Sprintf("Failed to get consumer group lags: %v", err.Error()),
			IsSilent: false,
		}
	}

	res := s.convertKgoGroupDescriptions(describedGroupsSharded, groupLags)
	sort.Slice(res, func(i, j int) bool { return res[i].GroupID < res[j].GroupID })

	return res, nil
}

func (s *Service) convertKgoGroupDescriptions(describedGroups *kafka.DescribeConsumerGroupsResponseSharded, offsets map[string][]GroupTopicOffsets) []ConsumerGroupOverview {
	result := make([]ConsumerGroupOverview, 0)
	for _, response := range describedGroups.Groups {
		if response.Error != nil {
			s.logger.Warn("failed to describe consumer groups from one group coordinator",
				zap.Error(response.Error),
				zap.Int32("coordinator_id", response.BrokerMetadata.NodeID),
			)
			continue
		}
		coordinatorID := response.BrokerMetadata.NodeID

		for _, d := range response.Groups.Groups {
			err := kerr.ErrorForCode(d.ErrorCode)
			if err != nil {
				s.logger.Warn("failed to describe consumer group, inner kafka error",
					zap.Error(err),
					zap.String("group_id", d.Group),
				)
				continue
			}

			result = append(result, ConsumerGroupOverview{
				GroupID:       d.Group,
				State:         d.State,
				ProtocolType:  d.ProtocolType,
				Protocol:      d.Protocol,
				Members:       s.convertGroupMembers(d.Members),
				CoordinatorID: coordinatorID,
				TopicOffsets:  offsets[d.Group],
			})
		}
	}

	return result
}

func (s *Service) convertGroupMembers(members []kmsg.DescribeGroupsResponseGroupMember) []GroupMemberDescription {
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
		memberAssignments := kmsg.ConsumerMemberAssignment{}
		err := memberAssignments.ReadFrom(m.MemberAssignment)
		if err != nil {
			s.logger.Debug("failed to decode member assignments", zap.String("client_id", m.ClientID), zap.Error(err))
		} else {
			for _, topic := range memberAssignments.Topics {
				partitionIDs := topic.Partitions
				if partitionIDs == nil {
					partitionIDs = make([]int32, 0)
				}
				sort.Slice(partitionIDs, func(i, j int) bool { return partitionIDs[i] < partitionIDs[j] })
				a := GroupMemberAssignment{
					TopicName:    topic.Topic,
					PartitionIDs: partitionIDs,
				}
				convertedAssignments = append(convertedAssignments, a)
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
