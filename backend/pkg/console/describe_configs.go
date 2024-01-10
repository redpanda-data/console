// Copyright 2024 Redpanda Data, Inc.
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

	"github.com/twmb/franz-go/pkg/kmsg"
)

// DescribeConfigs proxies the request to describe Topic or Broker configs to the Kafka client.
func (s *Service) DescribeConfigs(ctx context.Context, req *kmsg.DescribeConfigsRequest) (*kmsg.DescribeConfigsResponse, error) {
	return s.kafkaSvc.DescribeConfigs(ctx, req)
}
