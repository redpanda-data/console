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

// GetAPIVersions returns the supported Kafka API versions
func (s *Service) GetAPIVersions(ctx context.Context) (*kmsg.ApiVersionsResponse, error) {
	req := kmsg.NewApiVersionsRequest()
	req.ClientSoftwareVersion = "NA"
	req.ClientSoftwareName = "Kowl"

	return req.RequestWith(ctx, s.KafkaClient)
}
