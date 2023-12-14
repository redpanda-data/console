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
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/docker/go-connections/nat"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kversion"
	"github.com/twmb/franz-go/pkg/sr"
	"github.com/twmb/franz-go/plugin/kzap"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	things "github.com/redpanda-data/console/backend/pkg/testutil/testdata/proto/gen/things/v1"
)

// CreateClients creates kafka clients
func CreateClients(t *testing.T, brokers []string) (*kgo.Client, *kadm.Client) {
	t.Helper()

	logger, err := zap.NewDevelopment()
	require.NoError(t, err)

	opts := []kgo.Opt{
		kgo.SeedBrokers(brokers...),
		kgo.MaxVersions(kversion.V2_6_0()),
		kgo.FetchMaxBytes(5 * 1000 * 1000), // 5MB
		kgo.MaxConcurrentFetches(12),
		kgo.KeepControlRecords(),
		kgo.WithLogger(kzap.New(logger.Named("kafka_client"))),
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

// ProduceOrdersWithSchemas produces sample order records with schemas.
//
//nolint:revive // t is passed first for testing helper function.
func ProduceOrdersWithSchemas(t *testing.T, ctx context.Context, kafkaCl *kgo.Client, rcl *sr.Client, topic string) []int {
	ssID := produceOrdersWithSchemas(t, ctx, kafkaCl, rcl, "../testutil/testdata/proto/things/v1/widget.proto", topic,
		time.Date(2023, time.September, 12, 10, 0, 0, 0, time.UTC), 0,
		&things.Widget{},
		func(v any) ([]byte, error) {
			return proto.Marshal(v.(*things.Widget))
		}, func(b []byte, v any) error {
			return proto.Unmarshal(b, v.(*things.Widget))
		}, func(i int, recordTimeStamp time.Time) any {
			oID := strconv.Itoa(i)

			return &things.Widget{
				Id:        oID,
				CreatedAt: timestamppb.New(recordTimeStamp),
			}
		})

	rcl.SetCompatibilityLevel(ctx, sr.CompatNone, topic+"-value")

	ov := 1
	version := int32(1)

	ssID2 := produceOrdersWithSchemas(t, ctx, kafkaCl, rcl, "../testutil/testdata/proto/things/v1/item.proto", topic,
		time.Date(2023, time.September, 13, 10, 0, 0, 0, time.UTC), 20,
		&things.Item{},
		func(v any) ([]byte, error) {
			return proto.Marshal(v.(*things.Item))
		}, func(b []byte, v any) error {
			return proto.Unmarshal(b, v.(*things.Item))
		}, func(i int, recordTimeStamp time.Time) any {
			oID := strconv.Itoa(i)

			ov *= 2

			return &things.Item{
				Id:        oID,
				CreatedAt: timestamppb.New(recordTimeStamp),
				Version:   version,
				Name:      strconv.Itoa(ov),
			}
		})

	return []int{ssID, ssID2}
}

//nolint:revive // t is passed first for testing helper function.
func produceOrdersWithSchemas(t *testing.T, ctx context.Context, kafkaCl *kgo.Client, rcl *sr.Client,
	protoFilePath string, topic string, startTime time.Time, startIndex int,
	protoV any,
	encodeFn func(any) ([]byte, error),
	decodeFn func([]byte, any) error,
	generateFn func(int, time.Time) any,
) int {
	t.Helper()

	absProtoPath, err := filepath.Abs(protoFilePath)
	require.NoError(t, err)

	protoFile, err := os.ReadFile(filepath.Clean(absProtoPath))
	require.NoError(t, err)

	ss, err := rcl.CreateSchema(context.Background(), topic+"-value", sr.Schema{
		Schema: string(protoFile),
		Type:   sr.TypeProtobuf,
	})
	require.NoError(t, err)
	require.NotNil(t, ss)
	ticker := time.NewTicker(100 * time.Millisecond)

	// Set up Serde
	var serde sr.Serde
	serde.Register(
		ss.ID,
		protoV,
		sr.EncodeFn(encodeFn),
		sr.DecodeFn(decodeFn),
		sr.Index(0),
	)

	recordTimeStamp := startTime

	i := 0
	for i < 10 {
		select {
		case <-ctx.Done():
			return -1
		case <-ticker.C:
			index := i + startIndex
			oID := strconv.Itoa(index)

			msgData, err := serde.Encode(generateFn(index, recordTimeStamp))
			require.NoError(t, err)

			r := &kgo.Record{
				Key:       []byte(oID),
				Value:     msgData,
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

	return ss.ID
}

// MetricNameForTest creates metric name.
func MetricNameForTest(testName string) string {
	testName = testName[strings.LastIndex(testName, "/")+1:]

	return "test_redpanda_console_" + testName
}

// TopicNameForTest creates topic name.
func TopicNameForTest(testName string) string {
	testName = testName[strings.LastIndex(testName, "/")+1:]

	return "test.redpanda.console." + testName
}

// GetMappedHostPort gets the mapped host port for the container.
func GetMappedHostPort(ctx context.Context, c testcontainers.Container, port nat.Port) (string, error) {
	hostIP, err := c.Host(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get hostIP: %w", err)
	}

	mappedPort, err := c.MappedPort(ctx, port)
	if err != nil {
		return "", fmt.Errorf("failed to get mapped port: %w", err)
	}

	return fmt.Sprintf("%v:%d", hostIP, mappedPort.Int()), nil
}
