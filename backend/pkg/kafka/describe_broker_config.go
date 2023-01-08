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
	"strconv"

	"github.com/twmb/franz-go/pkg/kmsg"
)

// DescribeBrokerConfig fetches config entries which apply at the Broker Scope (e.g. offset.retention.minutes).
// Use nil for configNames in order to get all config entries.
func (s *Service) DescribeBrokerConfig(ctx context.Context, brokerID int32, configNames []string) (*kmsg.DescribeConfigsResponse, error) {
	resourceReq := kmsg.NewDescribeConfigsRequestResource()
	resourceReq.ResourceType = kmsg.ConfigResourceTypeBroker
	resourceReq.ResourceName = strconv.Itoa(int(brokerID)) // Empty string for all brokers (only works for dynamic broker configs)
	resourceReq.ConfigNames = configNames                  // Nil requests all

	req := kmsg.NewDescribeConfigsRequest()
	req.Resources = []kmsg.DescribeConfigsRequestResource{
		resourceReq,
	}
	req.IncludeSynonyms = true
	req.IncludeDocumentation = true

	return req.RequestWith(ctx, s.KafkaClient)
}
