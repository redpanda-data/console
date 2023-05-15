// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package console

import (
	"context"
	"testing"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/kafka"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

func Test_GetTopicConfigs(t *testing.T) {
	ctx := context.Background()
	log, err := zap.NewDevelopment()
	assert.NoError(t, err)

	cfg := config.Config{}
	cfg.SetDefaults()

	cfg.MetricsNamespace = metricNameForTest("_get_configs")
	cfg.Kafka.Brokers = []string{testSeedBroker}

	kafkaSvc, err := kafka.NewService(&cfg, log, cfg.MetricsNamespace)
	assert.NoError(t, err)

	svc, err := NewService(cfg.Console, log, kafkaSvc, nil, nil)
	assert.NoError(t, err)

	defer svc.kafkaSvc.KafkaClient.Close()

	topicConfig, restErr := svc.GetTopicConfigs(ctx, TEST_TOPIC_NAME, nil)
	assert.Nil(t, restErr)
	assert.NotNil(t, topicConfig)
	assert.Equal(t, TEST_TOPIC_NAME, topicConfig.TopicName)
	assert.NotEmpty(t, topicConfig.ConfigEntries)

	assert.NotNil(t, topicConfig.ConfigEntries[0])
	assert.False(t, topicConfig.ConfigEntries[0].IsReadOnly)
}
