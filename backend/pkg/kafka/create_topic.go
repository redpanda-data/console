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

// CreateTopic creates a Kafka topic.
func (s *Service) CreateTopic(ctx context.Context, createTopicReq kmsg.CreateTopicsRequestTopic) (*kmsg.CreateTopicsResponseTopic, error) {
	req := kmsg.NewCreateTopicsRequest()
	req.Topics = []kmsg.CreateTopicsRequestTopic{createTopicReq}

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("request has failed: %w", err)
	}
	if len(res.Topics) != 1 {
		return nil, fmt.Errorf("unexpected number of topic responses, expected exactly one but got '%v'", len(res.Topics))
	}

	return &res.Topics[0], nil
}
