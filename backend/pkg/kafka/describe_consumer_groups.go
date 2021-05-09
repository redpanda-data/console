package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

type DescribeConsumerGroupsResponseSharded struct {
	Groups         []DescribeConsumerGroupsResponse
	RequestsSent   int
	RequestsFailed int
}

func (d *DescribeConsumerGroupsResponseSharded) GetGroupIDs() []string {
	groupIDs := make([]string, 0)
	for _, groupResp := range d.Groups {
		if groupResp.Error != nil {
			continue
		}
		for _, group := range groupResp.Groups.Groups {
			err := kerr.ErrorForCode(group.ErrorCode)
			if err != nil {
				continue
			}
			groupIDs = append(groupIDs, group.Group)
		}
	}
	return groupIDs
}

func (d *DescribeConsumerGroupsResponseSharded) GetDescribedGroups() []kmsg.DescribeGroupsResponseGroup {
	describedGroups := make([]kmsg.DescribeGroupsResponseGroup, 0)
	for _, resp := range d.Groups {
		if resp.Error != nil {
			continue
		}
		describedGroups = append(describedGroups, resp.Groups.Groups...)
	}

	return describedGroups
}

type DescribeConsumerGroupsResponse struct {
	BrokerMetadata kgo.BrokerMetadata
	Groups         *kmsg.DescribeGroupsResponse
	Error          error
}

// DescribeConsumerGroups fetches additional information from Kafka about one or more Consumer groups.
// It returns a map where the coordinator BrokerID is the key.
func (s *Service) DescribeConsumerGroups(ctx context.Context, groups []string) (*DescribeConsumerGroupsResponseSharded, error) {
	req := kmsg.DescribeGroupsRequest{
		Groups:                      groups,
		IncludeAuthorizedOperations: false,
	}
	shardedResp := s.KafkaClient.RequestSharded(ctx, &req)

	result := &DescribeConsumerGroupsResponseSharded{
		Groups:         make([]DescribeConsumerGroupsResponse, 0),
		RequestsSent:   0,
		RequestsFailed: 0,
	}
	var lastErr error
	for _, kresp := range shardedResp {
		result.RequestsSent++
		if kresp.Err != nil {
			result.RequestsFailed++
			lastErr = kresp.Err
			continue
		}
		res := kresp.Resp.(*kmsg.DescribeGroupsResponse)

		result.Groups = append(result.Groups, DescribeConsumerGroupsResponse{
			BrokerMetadata: kresp.Meta,
			Groups:         res,
			Error:          kresp.Err,
		})
	}
	if result.RequestsSent > 0 && result.RequestsSent == result.RequestsFailed {
		return result, fmt.Errorf("all '%v' requests have failed, last error: %w", len(shardedResp), lastErr)
	}

	return result, nil
}

// DescribeConsumerGroup from Kafka and checks all possible errors that can occur for that request. If either the
// request fails or the group could not be described (e.g. due to ACLs) an error will be returned.
func (s *Service) DescribeConsumerGroup(ctx context.Context, groupID string) (kmsg.DescribeGroupsResponseGroup, error) {
	req := kmsg.NewDescribeGroupsRequest()
	req.Groups = []string{groupID}

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return kmsg.DescribeGroupsResponseGroup{}, err
	}
	if len(res.Groups) == 0 {
		return kmsg.DescribeGroupsResponseGroup{}, fmt.Errorf("describe group response is empty, expected one group")
	}

	describedGroup := res.Groups[0]
	err = kerr.ErrorForCode(describedGroup.ErrorCode)
	if err != nil {
		return kmsg.DescribeGroupsResponseGroup{}, fmt.Errorf("failed to describe consumer group: %w", err)
	}

	return describedGroup, nil
}
