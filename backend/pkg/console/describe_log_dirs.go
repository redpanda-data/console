// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"

	"github.com/twmb/franz-go/pkg/kmsg"
)

// DescribeLogDirs proxies the request/response for describing log directories via the Kafka API.
func (s *Service) DescribeLogDirs(ctx context.Context, req *kmsg.DescribeLogDirsRequest) (*kmsg.DescribeLogDirsResponse, error) {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}

	return req.RequestWith(ctx, cl)
}
