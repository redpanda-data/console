package owl

import (
	"context"
	"fmt"
	"sort"

	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

// ConsumerGroupOverview for a Kafka Consumer Group
type ConsumerGroupOverview struct {
	GroupID        string                    `json:"groupId"`
	State          string                    `json:"state"`
	ProtocolType   string                    `json:"protocolType"`
	Protocol       string                    `json:"-"`
	Members        []*GroupMemberDescription `json:"members"`
	CoordinatorID  int32                     `json:"coordinatorId"`
	Lags           *ConsumerGroupLag         `json:"lag"`
	AllowedActions []string                  `json:"allowedActions"`
}

// GroupMemberDescription is a member (e. g. connected host) of a Consumer Group
type GroupMemberDescription struct {
	ID          string                   `json:"id"`
	ClientID    string                   `json:"clientId"`
	ClientHost  string                   `json:"clientHost"`
	Assignments []*GroupMemberAssignment `json:"assignments"`
}

// GroupMemberAssignment represents a partition assignment for a group member
type GroupMemberAssignment struct {
	TopicName    string  `json:"topicName"`
	PartitionIDs []int32 `json:"partitionIds"`
}

// GetConsumerGroupsOverview returns a ConsumerGroupOverview for all available consumer groups
func (s *Service) GetConsumerGroupsOverview(ctx context.Context) ([]*ConsumerGroupOverview, error) {
	groups, err := s.kafkaSvc.ListConsumerGroups(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list consumer groups: %w", err)
	}

	describedGroups, err := s.kafkaSvc.DescribeConsumerGroups(ctx, groups.GroupIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to describe consumer groups: %w", err)
	}

	groupLags, err := s.getConsumerGroupLags(ctx, groups.GroupIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to get consumer group lags: %w", err)
	}

	res := make([]*ConsumerGroupOverview, 0)
	for id, group := range describedGroups {
		converted, err := s.convertSaramaGroupDescriptions(group.Groups, groupLags, id)
		if err != nil {
			return nil, fmt.Errorf("failed to convert group descriptions into group members: %w", err)
		}
		res = append(res, converted...)
	}
	sort.Slice(res, func(i, j int) bool { return res[i].GroupID < res[j].GroupID })

	return res, nil
}

func (s *Service) convertSaramaGroupDescriptions(descriptions []*sarama.GroupDescription, lags map[string]*ConsumerGroupLag, coordinator int32) ([]*ConsumerGroupOverview, error) {
	response := make([]*ConsumerGroupOverview, len(descriptions))
	for i, d := range descriptions {
		if d.Err != sarama.ErrNoError {
			return nil, d.Err
		}

		members, err := s.convertGroupMembers(d.Members, d.ProtocolType)
		if err != nil {
			return nil, err
		}
		response[i] = &ConsumerGroupOverview{
			GroupID:       d.GroupId,
			State:         d.State,
			ProtocolType:  d.ProtocolType,
			Protocol:      d.Protocol,
			Members:       members,
			CoordinatorID: coordinator,
			Lags:          lags[d.GroupId],
		}
	}

	return response, nil
}

func (s *Service) convertGroupMembers(members map[string]*sarama.GroupMemberDescription, protocolType string) ([]*GroupMemberDescription, error) {
	response := make([]*GroupMemberDescription, len(members))

	counter := 0
	for id, m := range members {
		// MemberAssignments is a byte array which will be set by kafka clients. All clients which use protocol
		// type "consumer" are supposed to follow a schema which we will try to parse below. If the protocol type
		// is different we won't even try to deserialize the byte array as this will likely fail.
		//
		// Confluent's Schema registry for instance does not follow that schema and does therefore set a different
		// protocol type.
		// see: https://cwiki.apache.org/confluence/display/KAFKA/A+Guide+To+The+Kafka+Protocol

		resultAssignments := make([]*GroupMemberAssignment, 0)
		if protocolType == "consumer" {
			assignments, err := m.GetMemberAssignment()
			if err != nil {
				s.logger.Warn("failed to decode member assignments", zap.String("client_id", m.ClientId), zap.Error(err))
			}

			for topic, partitionIDs := range assignments.Topics {
				sort.Slice(partitionIDs, func(i, j int) bool { return partitionIDs[i] < partitionIDs[j] })

				a := &GroupMemberAssignment{
					TopicName:    topic,
					PartitionIDs: partitionIDs,
				}
				resultAssignments = append(resultAssignments, a)
			}
		}

		// Sort all assignments by topicname
		sort.Slice(resultAssignments, func(i, j int) bool {
			return resultAssignments[i].TopicName < resultAssignments[j].TopicName
		})

		response[counter] = &GroupMemberDescription{
			ID:          id,
			ClientID:    m.ClientId,
			ClientHost:  m.ClientHost,
			Assignments: resultAssignments,
		}
		counter++
	}

	return response, nil
}
