// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// ListConsumerGroupsResponseSharded is a helper type with additional helper functions and it carries
// the sum of all response shards.
type ListConsumerGroupsResponseSharded struct {
	Groups         []ListConsumerGroupsResponse
	RequestsSent   int
	RequestsFailed int
}

// GetGroupIDs returns all consumer group ids that can be found in any of the list consumer
// group response shards.
func (l *ListConsumerGroupsResponseSharded) GetGroupIDs() []string {
	groupIDs := make([]string, 0)
	for _, groupResp := range l.Groups {
		if groupResp.Error != nil || groupResp.Groups == nil {
			continue
		}
		for _, group := range groupResp.Groups.Groups {
			groupIDs = append(groupIDs, group.Group)
		}
	}
	return groupIDs
}

// ListConsumerGroupsResponse is a single broker's response for listing consumer groups.
type ListConsumerGroupsResponse struct {
	BrokerMetadata kgo.BrokerMetadata
	Groups         *kmsg.ListGroupsResponse
	Error          error
}

// ListConsumerGroups returns an array of Consumer group ids. Failed broker requests will be returned in the response.
// If all broker requests fail an error will be returned.
func (s *Service) ListConsumerGroups(ctx context.Context) (*ListConsumerGroupsResponseSharded, error) {
	req := kmsg.ListGroupsRequest{}
	shardedResp := s.KafkaClient.RequestSharded(ctx, &req)

	result := &ListConsumerGroupsResponseSharded{
		Groups:         make([]ListConsumerGroupsResponse, len(shardedResp)),
		RequestsSent:   0,
		RequestsFailed: 0,
	}
	var lastErr error
	for _, kresp := range shardedResp {
		result.RequestsSent++
		if kresp.Err != nil {
			result.RequestsFailed++
			lastErr = kresp.Err
		}

		// Important: If we don't declare the second parameter, telling us if the cast succeeded,
		// we'll get a panic when the cast fails, instead of being able to continue.
		res, _ := kresp.Resp.(*kmsg.ListGroupsResponse)

		result.Groups = append(result.Groups, ListConsumerGroupsResponse{
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
