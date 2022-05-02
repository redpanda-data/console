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

func (s *Service) IncrementalAlterConfigs(ctx context.Context, alterConfigs []kmsg.IncrementalAlterConfigsRequestResource) (*kmsg.IncrementalAlterConfigsResponse, error) {
	req := kmsg.NewIncrementalAlterConfigsRequest()
	req.Resources = alterConfigs

	return req.RequestWith(ctx, s.KafkaClient)
}
