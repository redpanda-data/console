// Copyright 2022 Redpanda Data, Inc.
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

func (s *Service) EditTopicConfig(ctx context.Context, topicName string, configs []kmsg.IncrementalAlterConfigsRequestResourceConfig) error {
	return s.kafkaSvc.EditTopicConfig(ctx, topicName, configs)
}
