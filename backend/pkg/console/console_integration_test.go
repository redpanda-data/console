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
	"encoding/json"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kversion"
	"golang.org/x/sync/errgroup"
)

type ConsoleIntegrationTestSuite struct {
	suite.Suite

	redpandaContainer *redpanda.Container

	kafkaClient      *kgo.Client
	kafkaAdminClient *kadm.Client

	testSeedBroker string
}

func TestSuite(t *testing.T) {
	suite.Run(t, &ConsoleIntegrationTestSuite{})
}

func (s *ConsoleIntegrationTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx := context.Background()
	container, err := redpanda.RunContainer(ctx)
	require.NoError(err)
	s.redpandaContainer = container

	seedBroker, err := container.KafkaSeedBroker(ctx)
	require.NoError(err)

	s.testSeedBroker = seedBroker

	s.kafkaClient, s.kafkaAdminClient = createClients(t, []string{seedBroker})
}

func (s *ConsoleIntegrationTestSuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	assert.NoError(s.redpandaContainer.Terminate(context.Background()))
}

func createClients(t *testing.T, brokers []string) (*kgo.Client, *kadm.Client) {
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

func createTestData(t *testing.T, ctx context.Context,
	kClient *kgo.Client, kafkaAdminClient *kadm.Client, testTopicName string) {

	t.Helper()

	_, err := kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
	assert.NoError(t, err)

	g := new(errgroup.Group)
	g.Go(func() error {
		produceOrders(t, ctx, kClient, testTopicName)
		return nil
	})

	err = g.Wait()
	assert.NoError(t, err)
}

func produceOrders(t *testing.T, ctx context.Context, kafkaCl *kgo.Client, topic string) {
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
			}
			results := kafkaCl.ProduceSync(ctx, r)
			require.NoError(t, results.FirstErr())

			i++

			recordTimeStamp = recordTimeStamp.Add(1 * time.Minute)
		}
	}
}

func metricNameForTest(testName string) string {
	testName = testName[strings.LastIndex(testName, "/")+1:]

	return "test_redpanda_console_" + testName
}

func topicNameForTest(testName string) string {
	testName = testName[strings.LastIndex(testName, "/")+1:]

	return "test.redpanda.console." + testName
}
