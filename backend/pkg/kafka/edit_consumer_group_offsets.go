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
	"github.com/twmb/franz-go/pkg/kmsg"
)

// EditConsumerGroupOffsets edits the group offsets of an existing group.
func (s *Service) EditConsumerGroupOffsets(ctx context.Context, groupID string, topics []kmsg.OffsetCommitRequestTopic) (*kmsg.OffsetCommitResponse, error) {
	req := kmsg.NewOffsetCommitRequest()
	req.Group = groupID
	req.Topics = topics

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("failed to commit group offsets for group '%v': %w", groupID, err)
	}

	return res, nil
}

func (s *Service) DeleteConsumerGroupOffsets(ctx context.Context, groupID string, topics []kmsg.OffsetDeleteRequestTopic) (*kmsg.OffsetDeleteResponse, error) {
	req := kmsg.NewOffsetDeleteRequest()
	req.Group = groupID
	req.Topics = topics

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("failed to commit group offset delete request for group '%v': %w", groupID, err)
	}

	return res, nil
}
