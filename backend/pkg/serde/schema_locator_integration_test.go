// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package serde

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/testutil"
	"github.com/redpanda-data/console/backend/pkg/testutil/schemaseed"
)

// TestSchemaLocatorsIntegration decodes every fixture scenario from a real
// broker. It runs in its own container because the fixture needs fixed schema
// IDs.
func TestSchemaLocatorsIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Minute)
	defer cancel()

	container, err := redpanda.Run(ctx, testutil.RedpandaImage())
	testutil.LogContainerLogsIfFailed(ctx, t, container, err)
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, container.Terminate(context.Background()))
	})

	seedBroker, err := container.KafkaSeedBroker(ctx)
	require.NoError(t, err)
	registryAddress, err := container.SchemaRegistryAddress(ctx)
	require.NoError(t, err)

	kafkaClient, adminClient := testutil.CreateClients(t, []string{seedBroker})
	defer kafkaClient.Close()
	registryClient, err := sr.NewClient(sr.URLs(registryAddress))
	require.NoError(t, err)

	fixture, err := schemaseed.Seed(ctx, kafkaClient, adminClient, registryClient)
	require.NoError(t, err)

	svc := newSchemaContextTestService(t, registryAddress)
	records := consumeFixture(ctx, t, seedBroker, fixture)

	offsets := make(map[string]int)
	for _, sc := range fixture.Scenarios {
		offset := offsets[sc.Topic]
		offsets[sc.Topic]++
		record := records[sc.Topic][offset]

		dr := svc.DeserializeRecord(ctx, record, DeserializationOptions{
			SchemaContext: sc.TopicContext,
			Troubleshoot:  true,
		})
		t.Run(locatorTestName(sc, offset), func(t *testing.T) {
			assertLocatorWant(t, "key", sc.Key, dr.Key)
			assertLocatorWant(t, "value", sc.Value, dr.Value)
		})
	}
}

// consumeFixture reads every seeded record back, by topic in offset order.
func consumeFixture(ctx context.Context, t *testing.T, seedBroker string, fixture *schemaseed.Fixture) map[string][]*kgo.Record {
	t.Helper()

	want := make(map[string]int)
	for _, sc := range fixture.Scenarios {
		want[sc.Topic]++
	}
	topics := make([]string, 0, len(want))
	for topic := range want {
		topics = append(topics, topic)
	}

	consumer, err := kgo.NewClient(
		kgo.SeedBrokers(seedBroker),
		kgo.ConsumeTopics(topics...),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
		kgo.MetadataMinAge(250*time.Millisecond),
	)
	require.NoError(t, err)
	defer consumer.Close()

	records := make(map[string][]*kgo.Record)
	for remaining := len(fixture.Scenarios); remaining > 0; {
		fetches := consumer.PollFetches(ctx)
		require.NoError(t, fetches.Err())
		fetches.EachRecord(func(r *kgo.Record) {
			records[r.Topic] = append(records[r.Topic], r)
			remaining--
		})
	}
	for topic, n := range want {
		require.Len(t, records[topic], n, "records in %s", topic)
	}
	return records
}
