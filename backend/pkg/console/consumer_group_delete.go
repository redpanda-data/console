// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"
)

// DeleteConsumerGroup deletes a Kafka consumer group.
func (s *Service) DeleteConsumerGroup(ctx context.Context, groupID string) error {
	_, adminCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return err
	}

	res, err := adminCl.DeleteGroup(ctx, groupID)
	if err != nil {
		return fmt.Errorf("failed to delete group: %w", err)
	}
	if res.Err != nil {
		return fmt.Errorf("failed to delete group: %w", res.Err)
	}

	return nil
}
