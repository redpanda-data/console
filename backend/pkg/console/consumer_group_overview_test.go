// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/config"
	kafkafactory "github.com/redpanda-data/console/backend/pkg/factory/kafka"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func TestGetConsumerGroupsOverview_ClassicGroup_BulkAndExplicit(t *testing.T) {
	ctx := context.Background()
	req := require.New(t)
	ass := assert.New(t)

	svc, groupID := setupServiceWithClassicConsumerGroup(t)

	// Bulk: nil groupIDs
	overviews, restErr := svc.GetConsumerGroupsOverview(ctx, nil)
	req.Nil(restErr, "expected no rest error, got %v", restErr)
	found := requireOverviewByGroupID(t, overviews, groupID)
	ass.Equal("classic", found.GroupType)
	ass.Equal(groupID, found.GroupID)

	// Explicit: single group ID
	overviews, restErr = svc.GetConsumerGroupsOverview(ctx, []string{groupID})
	req.Nil(restErr, "expected no rest error, got %v", restErr)
	req.Len(overviews, 1)
	ass.Equal(groupID, overviews[0].GroupID)
	ass.Equal("classic", overviews[0].GroupType)
}

func TestGetConsumerGroupsOverview_ExplicitRequest_NonExistentGroup_Returns404(t *testing.T) {
	ctx := context.Background()
	req := require.New(t)

	fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1))
	req.NoError(err)
	defer fakeCluster.Close()

	cfg := config.Config{
		Kafka: config.Kafka{
			Brokers: fakeCluster.ListenAddrs(),
		},
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	factory := kafkafactory.NewCachedClientProvider(&cfg, logger, prometheus.NewRegistry())

	svc := &Service{
		cfg:                &cfg,
		logger:             logger,
		kafkaClientFactory: factory,
	}

	_, restErr := svc.GetConsumerGroupsOverview(ctx, []string{"nonexistent-group-id"})
	req.NotNil(restErr, "expected rest error for non-existent group")
	req.Equal(404, restErr.Status)
}

func setupServiceWithClassicConsumerGroup(t *testing.T) (*Service, string) {
	t.Helper()

	ctx := context.Background()
	req := require.New(t)

	fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1))
	req.NoError(err)
	t.Cleanup(fakeCluster.Close)

	client, adminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs())
	t.Cleanup(client.Close)

	const topicName = "test-topic"
	const groupID = "test-consumer-group"

	_, err = adminClient.CreateTopics(ctx, 1, 1, nil, topicName)
	req.NoError(err)

	produceResult := client.ProduceSync(ctx, &kgo.Record{
		Topic: topicName,
		Value: []byte("test message"),
	})
	req.NoError(produceResult.FirstErr())

	consumerClient, err := kgo.NewClient(
		kgo.SeedBrokers(fakeCluster.ListenAddrs()...),
		kgo.ConsumerGroup(groupID),
		kgo.ConsumeTopics(topicName),
	)
	req.NoError(err)
	t.Cleanup(consumerClient.Close)

	fetches := consumerClient.PollFetches(ctx)
	req.NoError(fetches.Err())
	req.NoError(consumerClient.CommitUncommittedOffsets(ctx))
	time.Sleep(100 * time.Millisecond)

	cfg := config.Config{
		Kafka: config.Kafka{
			Brokers: fakeCluster.ListenAddrs(),
		},
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	factory := kafkafactory.NewCachedClientProvider(&cfg, logger, prometheus.NewRegistry())

	return &Service{
		cfg:                &cfg,
		logger:             logger,
		kafkaClientFactory: factory,
	}, groupID
}

func requireOverviewByGroupID(t *testing.T, overviews []ConsumerGroupOverview, groupID string) ConsumerGroupOverview {
	t.Helper()
	for _, overview := range overviews {
		if overview.GroupID == groupID {
			return overview
		}
	}
	require.FailNow(t, fmt.Sprintf("expected to find group %q in overviews", groupID))
	return ConsumerGroupOverview{}
}
