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
	"go.uber.org/zap"
)

// IsHealthy checks whether it can communicate with the Kafka cluster or not
func (s *Service) IsHealthy(ctx context.Context) error {
	req := kmsg.MetadataRequest{
		Topics:                             []kmsg.MetadataRequestTopic{},
		AllowAutoTopicCreation:             false,
		IncludeClusterAuthorizedOperations: true,
		IncludeTopicAuthorizedOperations:   false,
	}
	kres, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		s.Logger.Error("failed to request metadata in health check", zap.Error(err))
		return fmt.Errorf("failed to request metadata: %w", err)
	}
	s.Logger.Debug("kafka cluster health check succeeded",
		zap.Int("broker_count", len(kres.Brokers)),
	)

	return nil
}
