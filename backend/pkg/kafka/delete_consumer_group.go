// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// DeleteConsumerGroup deletes a given consumer group via the Kafka API.
func (s *Service) DeleteConsumerGroup(ctx context.Context, groupID string) (*kmsg.DeleteGroupsResponseGroup, error) {
	req := kmsg.NewDeleteGroupsRequest()
	req.Groups = []string{groupID}

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, err
	}

	if len(res.Groups) != 1 {
		return nil, fmt.Errorf("expected one group in the response, but got %d groups", len(res.Groups))
	}

	groupRes := res.Groups[0]
	err = kerr.ErrorForCode(groupRes.ErrorCode)
	if err != nil {
		return nil, fmt.Errorf("failed to delete group: %w", err)
	}

	return &groupRes, nil
}
