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
)

// TopicConsumerGroup is a group along with it's accumulated topic log for a given topic
type TopicConsumerGroup struct {
	GroupID   string `json:"groupId"`
	SummedLag int64  `json:"summedLag"`
}

// ListTopicConsumers returns all consumer group names along with their accumulated lag across all partitions which
// have at least one active offset on the given topic.
func (s *Service) ListTopicConsumers(ctx context.Context, topicName string) ([]*TopicConsumerGroup, error) {
	groups, err := s.kafkaSvc.ListConsumerGroups(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list consumer groups: %w", err)
	}

	groupIDs := groups.GetGroupIDs()

	offsetsByGroup, err := s.getConsumerGroupOffsets(ctx, groupIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to get consumer group offsetsByGroup: %w", err)
	}

	response := make([]*TopicConsumerGroup, 0, len(offsetsByGroup))
	for groupID, grpTopicOffsets := range offsetsByGroup {
		for _, topicLag := range grpTopicOffsets {
			if topicLag.Topic != topicName {
				continue
			}

			cg := &TopicConsumerGroup{GroupID: groupID, SummedLag: topicLag.SummedLag}
			response = append(response, cg)
		}
	}

	return response, nil
}
