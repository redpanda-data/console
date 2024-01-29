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

// GetMetadata proxies the get metadata Kafka request/response.
func (s *Service) GetMetadata(ctx context.Context, kafkaReq *kmsg.MetadataRequest) (*kmsg.MetadataResponse, error) {
	return s.kafkaSvc.GetMetadata(ctx, kafkaReq)
}
