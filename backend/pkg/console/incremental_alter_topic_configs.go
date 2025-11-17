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
	"errors"

	"github.com/twmb/franz-go/pkg/kmsg"
)

// EditTopicConfig applies the given configs to the given topic.
func (s *Service) EditTopicConfig(ctx context.Context, topicName string, configs []kmsg.IncrementalAlterConfigsRequestResourceConfig) error {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return err
	}

	alterResource := kmsg.NewIncrementalAlterConfigsRequestResource()
	alterResource.ResourceName = topicName
	alterResource.ResourceType = kmsg.ConfigResourceTypeTopic
	alterResource.Configs = configs

	req := kmsg.NewIncrementalAlterConfigsRequest()
	req.Resources = []kmsg.IncrementalAlterConfigsRequestResource{alterResource}

	response, err := req.RequestWith(ctx, cl)
	if err != nil {
		return err
	}

	var kafkaErrs error
	for _, resource := range response.Resources {
		kafkaErr := newKafkaErrorWithDynamicMessage(resource.ErrorCode, resource.ErrorMessage)
		if kafkaErr != nil {
			kafkaErrs = errors.Join(kafkaErrs, kafkaErr)
		}
	}
	return kafkaErrs
}
