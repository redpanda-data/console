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

func (s *Service) DeleteTopics(ctx context.Context, topicNames []string) (*kmsg.DeleteTopicsResponse, error) {
	req := kmsg.NewDeleteTopicsRequest()
	req.TopicNames = topicNames
	req.TimeoutMillis = 30 * 1000 // 30s

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("failed to delete topics: %w", err)
	}

	return res, nil
}
