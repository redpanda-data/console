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
	GroupID               string                   `json:"groupId"`
	GroupType             string                   `json:"groupType"`
	State                 string                   `json:"state"`
	ProtocolType          string                   `json:"protocolType"`
	Protocol              string                   `json:"protocol"`
	GroupEpoch            *int32                   `json:"groupEpoch,omitempty"`
	TargetAssignmentEpoch *int32                   `json:"targetAssignmentEpoch,omitempty"`
	Members               []GroupMemberDescription `json:"members"`
	CoordinatorID         int32                    `json:"coordinatorId"`
	TopicOffsets          []GroupTopicOffsets      `json:"topicOffsets"`
}

// GroupMemberDescription is a member (e. g. connected host) of a Consumer Group
type GroupMemberDescription struct {
	ID                string                  `json:"id"`
	InstanceID        *string                 `json:"instanceId,omitempty"`
	ClientID          string                  `json:"clientId"`
	ClientHost        string                  `json:"clientHost"`
	Assignments       []GroupMemberAssignment `json:"assignments"`
	MemberEpoch       *int32                  `json:"memberEpoch,omitempty"`
	TargetAssignments []GroupMemberAssignment `json:"targetAssignments,omitempty"`
	SubscribedTopics  []string                `json:"subscribedTopics,omitempty"`
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

	listed, groupIDs, restErr := s.listRequestedGroups(ctx, adminCl, groupIDs)
	if restErr != nil {
		return nil, restErr
	}

	var classicIDs, consumerIDs []string
	for _, id := range groupIDs {
		if listed[id].GroupType == GroupTypeConsumer {
			consumerIDs = append(consumerIDs, id)
		} else {
			classicIDs = append(classicIDs, id)
		}
	}

	describedClassic, restErr := s.describeClassicGroups(ctx, adminCl, classicIDs)
	if restErr != nil {
		return nil, restErr
	}
	consumer, restErr := s.describeConsumerGroupsForOverview(ctx, adminCl, consumerIDs)
	if restErr != nil {
		return nil, restErr
	}

	offsetGroupIDs := make([]string, 0, len(groupIDs))
	offsetGroupIDs = append(offsetGroupIDs, describedClassic.Names()...)
	offsetGroupIDs = append(offsetGroupIDs, consumerIDs...)
	groupLags, err := s.getConsumerGroupOffsets(ctx, adminCl, offsetGroupIDs)
	if err != nil {
		return nil, &rest.Error{
			Err:      fmt.Errorf("failed to get consumer group lags: %w", err),
			Status:   http.StatusNotFound,
			Message:  fmt.Sprintf("Failed to get consumer group lags: %v", err.Error()),
			IsSilent: false,
		}
	}

	res := make([]ConsumerGroupOverview, 0, len(groupIDs))
	res = append(res, s.convertKgoGroupDescriptions(describedClassic, groupLags)...)
	res = append(res, s.convertConsumerGroupDescriptions(consumer.described, groupLags)...)
	for _, id := range consumer.undescribedIDs {
		lg := listed[id]
		res = append(res, ConsumerGroupOverview{
			GroupID:       id,
			GroupType:     GroupTypeConsumer,
			State:         lg.State,
			ProtocolType:  GroupTypeConsumer,
			Members:       []GroupMemberDescription{},
			CoordinatorID: lg.Coordinator,
			TopicOffsets:  groupLags[id],
		})
	}
	sort.Slice(res, func(i, j int) bool { return res[i].GroupID < res[j].GroupID })

	return res, nil
}

// listRequestedGroups lists the groups of the cluster and returns the IDs to describe: the
// requested ones, or all listed groups when none were requested. A requested group that is
// not listed is a 404, unless a broker failed to answer, because the group can be on it.
func (s *Service) listRequestedGroups(ctx context.Context, adminCl *kadm.Client, groupIDs []string) (kadm.ListedGroups, []string, *rest.Error) {
	listed, err := listGroups(ctx, adminCl)
	var listShardErrs *kadm.ShardErrors
	if err != nil {
		if !errors.As(err, &listShardErrs) || listShardErrs.AllFailed {
			return nil, nil, &rest.Error{
				Err:      fmt.Errorf("failed to list consumer groups: %w", err),
				Status:   http.StatusInternalServerError,
				Message:  "Failed to list consumer groups",
				IsSilent: false,
			}
		}
		s.logShardErrors(ctx, "listing consumer groups", listShardErrs)
	}

	if groupIDs == nil {
		groupIDs = make([]string, 0, len(listed))
		for name := range listed {
			groupIDs = append(groupIDs, name)
		}
		return listed, groupIDs, nil
	}

	// Not existent consumer groups will be reported as "dead" by Kafka. We would like to report them as 404 instead.
	for _, id := range groupIDs {
		if _, exists := listed[id]; exists {
			continue
		}
		if listShardErrs != nil {
			return nil, nil, &rest.Error{
				Err:      fmt.Errorf("group '%v' is not in the groups listed by the reachable brokers: %w", id, listShardErrs),
				Status:   http.StatusServiceUnavailable,
				Message:  "Failed to list consumer groups from all brokers",
				IsSilent: false,
			}
		}
		return nil, nil, &rest.Error{
			Err:      fmt.Errorf("requested group id '%v' does not exist in Kafka cluster", id),
			Status:   http.StatusNotFound,
			Message:  fmt.Sprintf("Requested group id '%v' does not exist in Kafka cluster", id),
			IsSilent: false,
		}
	}
	return listed, groupIDs, nil
}

func (s *Service) describeClassicGroups(ctx context.Context, adminCl *kadm.Client, groupIDs []string) (kadm.DescribedGroups, *rest.Error) {
	if len(groupIDs) == 0 {
		return nil, nil
	}
	described, err := adminCl.DescribeGroups(ctx, groupIDs...)
	if err != nil {
		var se *kadm.ShardErrors
		if !errors.As(err, &se) || se.AllFailed {
			return nil, errorToRestError(err)
		}
		s.logShardErrors(ctx, "describing consumer groups", se)
	}
	return described, nil
}

type describedConsumerGroups struct {
	described kadm.DescribedConsumerGroups
	// undescribedIDs are the consumer groups the broker listed but did not describe.
	undescribedIDs []string
}

func (s *Service) describeConsumerGroupsForOverview(ctx context.Context, adminCl *kadm.Client, groupIDs []string) (describedConsumerGroups, *rest.Error) {
	var result describedConsumerGroups
	if len(groupIDs) == 0 {
		return result, nil
	}

	described, err := adminCl.DescribeConsumerGroups(ctx, groupIDs...)
	if err != nil {
		var ae *kadm.AuthError
		if errors.As(err, &ae) {
			return result, errorToRestError(err)
		}
		// Redpanda hides ConsumerGroupDescribe while the KIP-848 protocol is disabled, and
		// older brokers do not have it. The groups are still listed with the state and
		// type from ListGroups, just without members.
		s.logger.WarnContext(ctx, "failed to describe KIP-848 consumer groups, falling back to the listed state", slog.Any("error", err))
	}
	result.described = described
	for _, id := range groupIDs {
		if g, exists := described[id]; !exists || g.Err != nil {
			result.undescribedIDs = append(result.undescribedIDs, id)
		}
	}
	return result, nil
}

func (s *Service) logShardErrors(ctx context.Context, action string, se *kadm.ShardErrors) {
	s.logger.WarnContext(ctx, "failed "+action+" from some shards", slog.Int("failed_shards", len(se.Errs)))
	for _, shardErr := range se.Errs {
		s.logger.WarnContext(ctx, "shard error "+action,
			slog.Int("broker_id", int(shardErr.Broker.NodeID)),
			slog.Any("error", shardErr.Err))
	}
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
			GroupType:     GroupTypeClassic,
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

func (s *Service) convertConsumerGroupDescriptions(describedGroups kadm.DescribedConsumerGroups, offsets map[string][]GroupTopicOffsets) []ConsumerGroupOverview {
	result := make([]ConsumerGroupOverview, 0, len(describedGroups))
	for _, group := range describedGroups.Sorted() {
		if group.Err != nil {
			s.logger.Warn("failed to describe KIP-848 consumer group",
				slog.String("group_id", group.Group),
				slog.Int("coordinator_id", int(group.Coordinator.NodeID)),
				slog.Any("error", group.Err))
			continue
		}

		groupEpoch := group.Epoch
		assignmentEpoch := group.AssignmentEpoch
		result = append(result, ConsumerGroupOverview{
			GroupID:               group.Group,
			GroupType:             GroupTypeConsumer,
			State:                 group.State,
			ProtocolType:          GroupTypeConsumer,
			Protocol:              group.AssignorName,
			GroupEpoch:            &groupEpoch,
			TargetAssignmentEpoch: &assignmentEpoch,
			Members:               convertConsumerGroupMembers(group.Members),
			CoordinatorID:         group.Coordinator.NodeID,
			TopicOffsets:          offsets[group.Group],
		})
	}

	return result
}

func convertConsumerGroupMembers(members []kadm.ConsumerGroupMember) []GroupMemberDescription {
	response := make([]GroupMemberDescription, 0, len(members))
	for _, m := range members {
		memberEpoch := m.MemberEpoch
		subscribed := slices.Clone(m.SubscribedTopics)
		slices.Sort(subscribed)
		response = append(response, GroupMemberDescription{
			ID:                m.MemberID,
			InstanceID:        m.InstanceID,
			ClientID:          m.ClientID,
			ClientHost:        m.ClientHost,
			Assignments:       convertConsumerAssignment(m.Assignment),
			MemberEpoch:       &memberEpoch,
			TargetAssignments: convertConsumerAssignment(m.TargetAssignment),
			SubscribedTopics:  subscribed,
		})
	}
	sort.Slice(response, func(i, j int) bool { return response[i].ID < response[j].ID })
	return response
}

func convertConsumerAssignment(assignment kadm.TopicsSet) []GroupMemberAssignment {
	sorted := assignment.Sorted()
	assignments := make([]GroupMemberAssignment, 0, len(sorted))
	for _, tp := range sorted {
		assignments = append(assignments, GroupMemberAssignment{TopicName: tp.Topic, PartitionIDs: tp.Partitions})
	}
	return assignments
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
			InstanceID:  m.InstanceID,
			ClientID:    m.ClientID,
			ClientHost:  m.ClientHost,
			Assignments: convertedAssignments,
		})
	}

	return response
}
