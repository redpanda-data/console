package owl

import (
	"context"
	"fmt"
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
	Protocol       string                   `json:"-"`
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
	allGroups := []string{}
	describedGroupsSharded, err := s.kafkaSvc.DescribeConsumerGroups(ctx, allGroups)
	if err != nil {
		return nil, fmt.Errorf("failed to describe consumer groups: %w", err)
	}

	groupLags, err := s.getConsumerGroupLags(ctx, describedGroupsSharded.GetGroupIDs())
	if err != nil {
		return nil, fmt.Errorf("failed to get consumer group lags: %w", err)
	}

	res := make([]ConsumerGroupOverview, 0)
	converted, err := s.convertKgoGroupDescriptions(describedGroupsSharded.GetDescribedGroups(), groupLags)
	if err != nil {
		return nil, fmt.Errorf("failed to convert group descriptions into group members: %w", err)
	}
	res = append(res, converted...)
	sort.Slice(res, func(i, j int) bool { return res[i].GroupID < res[j].GroupID })

	return res, nil
}

func (s *Service) convertKgoGroupDescriptions(descriptions []kmsg.DescribeGroupsResponseGroup, lags map[string]*ConsumerGroupLag) ([]ConsumerGroupOverview, error) {
	response := make([]ConsumerGroupOverview, len(descriptions))
	for i, d := range descriptions {
		err := kerr.ErrorForCode(d.ErrorCode)
		if err != nil {
			return nil, err
		}

		members, err := s.convertGroupMembers(d.Members)
		if err != nil {
			return nil, fmt.Errorf("failed to convert group members from described groups to kowl response type: %w", err)
		}
		response[i] = ConsumerGroupOverview{
			GroupID:       d.Group,
			State:         d.State,
			ProtocolType:  d.ProtocolType,
			Protocol:      d.Protocol,
			Members:       members,
			CoordinatorID: 0,
			Lags:          lags[d.Group],
			// TODO: AllowedActions: d.AuthorizedOperations,
		}
	}

	return response, nil
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
