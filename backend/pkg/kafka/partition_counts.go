// Copyright 2025 Redpanda Data, Inc.
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

	"github.com/twmb/franz-go/pkg/kadm"
)

// AddPartitionsToTopics adds partition counts to topics.
func (s *Service) AddPartitionsToTopics(ctx context.Context, add int, topicNames []string) (kadm.CreatePartitionsResponses, error) {
	return s.KafkaAdmClient.CreatePartitions(ctx, add, topicNames...)
}

// ValidateAddPartitionsToTopics is same as AddPartitionsToTopics but only performs the validation.
func (s *Service) ValidateAddPartitionsToTopics(ctx context.Context, add int, topicNames []string) (kadm.CreatePartitionsResponses, error) {
	return s.KafkaAdmClient.ValidateCreatePartitions(ctx, add, topicNames...)
}

// SetPartitionsToTopics sets partition counts to topics.
func (s *Service) SetPartitionsToTopics(ctx context.Context, count int, topicNames []string) (kadm.CreatePartitionsResponses, error) {
	return s.KafkaAdmClient.UpdatePartitions(ctx, count, topicNames...)
}

// ValidateSetPartitionsToTopics is same as SetPartitionsToTopics but only performs the validation.
func (s *Service) ValidateSetPartitionsToTopics(ctx context.Context, count int, topicNames []string) (kadm.CreatePartitionsResponses, error) {
	return s.KafkaAdmClient.ValidateUpdatePartitions(ctx, count, topicNames...)
}
