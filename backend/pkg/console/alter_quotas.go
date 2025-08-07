// Copyright 2025 Redpanda Data, Inc.
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

// AlterClientQuotas modifies client quotas in the Kafka cluster.
// This method can be used to both create and delete quotas by setting the Remove field
// in the AlterClientQuotasRequestEntryOp operations:
// - Remove: false - Creates or updates quota values
// - Remove: true  - Deletes existing quota values
func (s *Service) AlterClientQuotas(ctx context.Context, req *kmsg.AlterClientQuotasRequest) (*kmsg.AlterClientQuotasResponse, error) {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}

	return req.RequestWith(ctx, cl)
}
