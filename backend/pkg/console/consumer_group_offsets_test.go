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
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func TestGetConsumerGroupOffsets_DeletedTopic(t *testing.T) {
	ctx := context.Background()
	req := require.New(t)
	ass := assert.New(t)

	// Create a fake Kafka cluster
	fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1))
	req.NoError(err)
	defer fakeCluster.Close()

	// Create clients
	client, adminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs())
	defer client.Close()

	// Create a topic
	topicName := "test-deleted-topic"
	_, err = adminClient.CreateTopics(ctx, 1, 1, nil, topicName)
	req.NoError(err)

	// Produce a message to the topic
	produceResult := client.ProduceSync(ctx, &kgo.Record{
		Topic: topicName,
		Value: []byte("test message"),
	})
	req.NoError(produceResult.FirstErr())

	// Create a consumer group and commit offset for the topic
	groupID := "test-consumer-group"
	consumerClient, err := kgo.NewClient(
		kgo.SeedBrokers(fakeCluster.ListenAddrs()...),
		kgo.ConsumerGroup(groupID),
		kgo.ConsumeTopics(topicName),
	)
	req.NoError(err)
	defer consumerClient.Close()

	// Consume the message to commit offset
	fetches := consumerClient.PollFetches(ctx)
	req.NoError(fetches.Err())
	req.NotEmpty(fetches.Records())

	// Commit the offset
	req.NoError(consumerClient.CommitUncommittedOffsets(ctx))

	// Wait a bit to ensure offset is committed
	time.Sleep(100 * time.Millisecond)

	// Verify offset was committed
	offsetResponses, err := kadm.NewClient(client).FetchOffsets(ctx, groupID)
	req.NoError(err)
	req.True(offsetResponses.Ok(), "Should have committed offsets")

	// Now delete the topic
	_, err = adminClient.DeleteTopics(ctx, topicName)
	req.NoError(err)

	// Wait for topic deletion to propagate
	time.Sleep(200 * time.Millisecond)

	// Create Console service
	cfg := &config.Config{}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	consoleSvc := &Service{
		cfg:    cfg,
		logger: logger,
	}

	// Test: Get consumer group offsets for a group that has offsets for a deleted topic
	// This should NOT return an error, it should skip the deleted topic gracefully
	result, err := consoleSvc.getConsumerGroupOffsets(ctx, adminClient, []string{groupID})

	// Assert the function handles the deleted topic gracefully - it MUST NOT error
	req.NoError(err, "Function should handle deleted topics gracefully without returning an error")
	ass.NotNil(result)

	groupOffsets, exists := result[groupID]
	req.True(exists, "Group should exist in results")

	// The deleted topic should NOT appear in the results (it should be skipped)
	for _, topicOffset := range groupOffsets {
		ass.NotEqual(topicName, topicOffset.Topic,
			"Deleted topic should not appear in results, found: %+v", topicOffset)
	}
}

func TestGetConsumerGroupOffsets_NonExistentTopicInMetadata(t *testing.T) {
	ctx := context.Background()
	req := require.New(t)
	ass := assert.New(t)

	// Create a fake Kafka cluster
	fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1))
	req.NoError(err)
	defer fakeCluster.Close()

	// Create clients
	client, adminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs())
	defer client.Close()

	// Create topics
	existingTopic := "existing-topic"
	deletedTopic := "will-be-deleted-topic"

	_, err = adminClient.CreateTopics(ctx, 1, 1, nil, existingTopic, deletedTopic)
	req.NoError(err)

	// Produce messages to both topics
	produceResults := client.ProduceSync(ctx,
		&kgo.Record{Topic: existingTopic, Value: []byte("msg1")},
		&kgo.Record{Topic: deletedTopic, Value: []byte("msg2")},
	)
	req.NoError(produceResults.FirstErr())

	// Create a consumer group and commit offsets for both topics
	groupID := "test-multi-topic-group"
	consumerClient, err := kgo.NewClient(
		kgo.SeedBrokers(fakeCluster.ListenAddrs()...),
		kgo.ConsumerGroup(groupID),
		kgo.ConsumeTopics(existingTopic, deletedTopic),
	)
	req.NoError(err)
	defer consumerClient.Close()

	// Consume messages to commit offsets
	fetches := consumerClient.PollFetches(ctx)
	req.NoError(fetches.Err())
	req.NotEmpty(fetches.Records())

	// Commit the offsets
	req.NoError(consumerClient.CommitUncommittedOffsets(ctx))
	time.Sleep(100 * time.Millisecond)

	// Now delete one topic
	_, err = adminClient.DeleteTopics(ctx, deletedTopic)
	req.NoError(err)
	time.Sleep(200 * time.Millisecond)

	// Create Console service
	cfg := &config.Config{}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	consoleSvc := &Service{
		cfg:    cfg,
		logger: logger,
	}

	// Test: Get consumer group offsets when group has offsets for both existing and deleted topics
	result, err := consoleSvc.getConsumerGroupOffsets(ctx, adminClient, []string{groupID})

	// The function should handle this gracefully
	req.NoError(err, "Should not error when one topic is deleted")

	// Expected result: only the existing topic, with 1 partition and offset at position 1
	expected := map[string][]GroupTopicOffsets{
		groupID: {
			{
				Topic:                existingTopic,
				SummedLag:            0,
				PartitionCount:       1,
				PartitionsWithOffset: 1,
				PartitionOffsets: []PartitionOffsets{
					{
						PartitionID:   0,
						GroupOffset:   1,
						HighWaterMark: 1,
						Lag:           0,
					},
				},
			},
		},
	}

	ass.Equal(expected, result, "Result should match expected (deleted topic skipped)")
}
