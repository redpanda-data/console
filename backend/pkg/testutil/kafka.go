// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package testutil package holds common utility functions for testing
package testutil

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kversion"
	"golang.org/x/sync/errgroup"
)

// CreateClients creates kafka clients
func CreateClients(t *testing.T, brokers []string) (*kgo.Client, *kadm.Client) {
	t.Helper()

	opts := []kgo.Opt{
		kgo.SeedBrokers(brokers...),
		kgo.MaxVersions(kversion.V2_6_0()),
		kgo.FetchMaxBytes(5 * 1000 * 1000), // 5MB
		kgo.MaxConcurrentFetches(12),
		kgo.KeepControlRecords(),
	}

	kClient, err := kgo.NewClient(opts...)
	require.NoError(t, err)

	kafkaAdmCl := kadm.NewClient(kClient)

	return kClient, kafkaAdmCl
}

// CreateTestData creates kafka topic and sample data in the topic
//
//nolint:revive // t is passed first for testing helper function.
func CreateTestData(t *testing.T, ctx context.Context,
	kClient *kgo.Client, kafkaAdminClient *kadm.Client, testTopicName string,
) {
	t.Helper()

	_, err := kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
	assert.NoError(t, err)

	g := new(errgroup.Group)
	g.Go(func() error {
		ProduceOrders(t, ctx, kClient, testTopicName)
		return nil
	})

	err = g.Wait()
	assert.NoError(t, err)
}

// ProduceOrders produces sample orders to the topic with the given client
//
//nolint:revive // t is passed first for testing helper function.
func ProduceOrders(t *testing.T, ctx context.Context, kafkaCl *kgo.Client, topic string) {
	t.Helper()

	ticker := time.NewTicker(100 * time.Millisecond)

	recordTimeStamp := time.Date(2010, time.November, 10, 13, 0, 0, 0, time.UTC)

	i := 0
	for i < 20 {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			order := Order{ID: strconv.Itoa(i)}
			serializedOrder, err := json.Marshal(order)
			require.NoError(t, err)

			r := &kgo.Record{
				Key:       []byte(order.ID),
				Value:     serializedOrder,
				Topic:     topic,
				Timestamp: recordTimeStamp,
				Headers: []kgo.RecordHeader{
					{
						Key:   "revision",
						Value: []byte("0"),
					},
				},
			}
			results := kafkaCl.ProduceSync(ctx, r)
			require.NoError(t, results.FirstErr())

			i++

			recordTimeStamp = recordTimeStamp.Add(1 * time.Minute)
		}
	}
}

// MetricNameForTest creates metric name
func MetricNameForTest(testName string) string {
	testName = testName[strings.LastIndex(testName, "/")+1:]

	return "test_redpanda_console_" + testName
}

// TopicNameForTest creates topic name
func TopicNameForTest(testName string) string {
	testName = testName[strings.LastIndex(testName, "/")+1:]

	return "test.redpanda.console." + testName
}
