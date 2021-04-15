package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"sort"

	"go.uber.org/zap"
)

// ConsumerGroupOverview for a Kafka Consumer Group
type ConsumerGroupOverview struct {
	GroupID        string                   `json:"groupId"`
	State          string                   `json:"state"`
	ProtocolType   string                   `json:"protocolType"`
	Protocol       string                   `json:"protocol"`
	Members        []GroupMemberDescription `json:"members"`
	CoordinatorID  int32                    `json:"coordinatorId"`
	Lags           *ConsumerGroupLag        `json:"lag"`
	AllowedActions []string                 `json:"allowedActions"`
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
func (s *Service) GetConsumerGroupsOverview(ctx context.Context) ([]ConsumerGroupOverview, error) {
	groups, err := s.kafkaSvc.ListConsumerGroups(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list consumer groups: %w", err)
	}

	describedGroupsSharded, err := s.kafkaSvc.DescribeConsumerGroups(ctx, groups.GetGroupIDs())
	if err != nil {
		return nil, fmt.Errorf("failed to describe consumer groups: %w", err)
	}

	groupLags, err := s.getConsumerGroupLags(ctx, describedGroupsSharded.GetGroupIDs())
	if err != nil {
		return nil, fmt.Errorf("failed to get consumer group lags: %w", err)
	}

	res := s.convertKgoGroupDescriptions(describedGroupsSharded, groupLags)
	sort.Slice(res, func(i, j int) bool { return res[i].GroupID < res[j].GroupID })

	return res, nil
}

func (s *Service) convertKgoGroupDescriptions(describedGroups *kafka.DescribeConsumerGroupsResponseSharded, lags map[string]*ConsumerGroupLag) []ConsumerGroupOverview {
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

			members, err := s.convertGroupMembers(d.Members)
			if err != nil {
				s.logger.Warn("failed to convert group members from described groups to kowl result type",
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
				Members:       members,
				CoordinatorID: coordinatorID,
				Lags:          lags[d.Group],
			})
		}
	}

	return result
}

func (s *Service) convertGroupMembers(members []kmsg.DescribeGroupsResponseGroupMember) ([]GroupMemberDescription, error) {
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
		memberAssignments := kmsg.GroupMemberAssignment{}
		err := memberAssignments.ReadFrom(m.MemberAssignment)
		if err != nil {
			s.logger.Debug("failed to decode member assignments", zap.String("client_id", m.ClientID), zap.Error(err))
		} else {
			for _, topic := range memberAssignments.Topics {
				partitionIDs := topic.Partitions
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

	return response, nil
}
