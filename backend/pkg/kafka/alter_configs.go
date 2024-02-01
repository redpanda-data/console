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

// IncrementalAlterConfigs sends a request to alter a Kafka resource's (broker, topics, ...) configuration.
func (s *Service) IncrementalAlterConfigs(ctx context.Context, req *kmsg.IncrementalAlterConfigsRequest) (*kmsg.IncrementalAlterConfigsResponse, error) {
	return req.RequestWith(ctx, s.KafkaClient)
}

// AlterConfigs sends a request to set a Kafka resource's (broker, topics, ...) configuration.
func (s *Service) AlterConfigs(ctx context.Context, req *kmsg.AlterConfigsRequest) (*kmsg.AlterConfigsResponse, error) {
	return req.RequestWith(ctx, s.KafkaClient)
}
