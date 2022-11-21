// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func (s *Service) EditTopicConfig(ctx context.Context, topicName string, configs []kmsg.IncrementalAlterConfigsRequestResourceConfig) error {
	alterResource := kmsg.NewIncrementalAlterConfigsRequestResource()
	alterResource.ResourceName = topicName
	alterResource.ResourceType = kmsg.ConfigResourceTypeTopic
	alterResource.Configs = configs

	req := kmsg.NewIncrementalAlterConfigsRequest()
	req.Resources = []kmsg.IncrementalAlterConfigsRequestResource{alterResource}

	response, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return fmt.Errorf("failed to request alter configs: %w", err)
	}

	for _, res := range response.Resources {
		if err := kerr.ErrorForCode(res.ErrorCode); err != nil {
			errMsg := err.Error()
			if res.ErrorMessage != nil {
				errMsg = *res.ErrorMessage
			}
			return fmt.Errorf("failed to edit topic config: %v", errMsg)
		}
	}

	return nil
}
