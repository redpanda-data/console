// Copyright 2023 Redpanda Data, Inc.
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

	"github.com/twmb/franz-go/pkg/kgo"
)

// CreateKafkaClient returns a new Kafka client based on the existing Kafka configuration.
func (s *Service) CreateKafkaClient(_ context.Context, additionalOpts ...kgo.Opt) (*kgo.Client, error) {
	return s.kafkaSvc.NewKgoClient(additionalOpts...)
}
