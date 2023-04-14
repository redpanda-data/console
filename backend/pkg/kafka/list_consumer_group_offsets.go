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

	"github.com/twmb/franz-go/pkg/kadm"
	"go.uber.org/zap"
)

// ListConsumerGroupOffsetsBulk returns the committed group offsets for one or more consumer groups.
func (s *Service) ListConsumerGroupOffsetsBulk(ctx context.Context, groups []string) kadm.FetchOffsetsResponses {
	res := s.KafkaAdmClient.FetchManyOffsets(ctx, groups...)
	res.EachError(func(shardRes kadm.FetchOffsetsResponse) {
		s.Logger.Warn("failed to fetch group offset",
			zap.String("group", shardRes.Group),
			zap.Error(shardRes.Err))
	})
	return res
}
