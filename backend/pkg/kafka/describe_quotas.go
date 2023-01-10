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
	"github.com/twmb/franz-go/pkg/kmsg"
	"golang.org/x/net/context"
)

// DescribeQuotas requests a list of configured Quota rules via the Kafka API.
func (s *Service) DescribeQuotas(ctx context.Context) (*kmsg.DescribeClientQuotasResponse, error) {
	r := kmsg.NewDescribeClientQuotasRequest()
	return r.RequestWith(ctx, s.KafkaClient)
}
