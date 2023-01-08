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

	"github.com/twmb/franz-go/pkg/kmsg"
)

func (s *Service) ListPartitionReassignments(ctx context.Context) (*kmsg.ListPartitionReassignmentsResponse, error) {
	req := kmsg.NewListPartitionReassignmentsRequest()
	req.Topics = nil // List for all topics

	return req.RequestWith(ctx, s.KafkaClient)
}

func (s *Service) AlterPartitionAssignments(ctx context.Context, topics []kmsg.AlterPartitionAssignmentsRequestTopic) (*kmsg.AlterPartitionAssignmentsResponse, error) {
	req := kmsg.NewAlterPartitionAssignmentsRequest()
	req.Topics = topics

	return req.RequestWith(ctx, s.KafkaClient)
}
