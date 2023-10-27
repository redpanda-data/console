// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package serde

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/hamba/avro/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"go.uber.org/zap"
	"google.golang.org/genproto/googleapis/type/color"
	"google.golang.org/genproto/googleapis/type/dayofweek"
	"google.golang.org/genproto/googleapis/type/decimal"
	"google.golang.org/genproto/googleapis/type/fraction"
	"google.golang.org/genproto/googleapis/type/latlng"
	"google.golang.org/genproto/googleapis/type/money"
	"google.golang.org/genproto/googleapis/type/month"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/redpanda-data/console/backend/pkg/config"
	ms "github.com/redpanda-data/console/backend/pkg/msgpack"
	protoPkg "github.com/redpanda-data/console/backend/pkg/proto"
	"github.com/redpanda-data/console/backend/pkg/schema"
	"github.com/redpanda-data/console/backend/pkg/serde/testdata/proto/gen/common"
	indexv1 "github.com/redpanda-data/console/backend/pkg/serde/testdata/proto/gen/index/v1"
	shopv1 "github.com/redpanda-data/console/backend/pkg/serde/testdata/proto/gen/shop/v1"
	shopv2 "github.com/redpanda-data/console/backend/pkg/serde/testdata/proto/gen/shop/v2"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type SerdeIntegrationTestSuite struct {
	suite.Suite

	redpandaContainer testcontainers.Container

	kafkaClient      *kgo.Client
	kafkaAdminClient *kadm.Client

	seedBroker      string
	registryAddress string
	log             *zap.Logger
}

func TestSuite(t *testing.T) {
	suite.Run(t, &SerdeIntegrationTestSuite{})
}

func (s *SerdeIntegrationTestSuite) createBaseConfig() config.Config {
	cfg := config.Config{}
	cfg.SetDefaults()
	cfg.MetricsNamespace = testutil.MetricNameForTest("serde")
	cfg.Kafka.Brokers = []string{s.seedBroker}
	cfg.Kafka.Protobuf.Enabled = true
	cfg.Kafka.Protobuf.SchemaRegistry.Enabled = true
	cfg.Kafka.Schema.Enabled = true
	cfg.Kafka.Schema.URLs = []string{s.registryAddress}
	cfg.Kafka.MessagePack.Enabled = false

	return cfg
}

func (s *SerdeIntegrationTestSuite) consumerClientForTopic(topicName string) *kgo.Client {
	t := s.T()
	require := require.New(t)

	cl, err := kgo.NewClient(
		kgo.SeedBrokers(s.seedBroker),
		kgo.ConsumeTopics(topicName),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
	)
	require.NoError(err)

	return cl
}

func (s *SerdeIntegrationTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx := context.Background()

	redpandaContainer, err := redpanda.RunContainer(ctx, testcontainers.WithImage("redpandadata/redpanda:v23.2.6"))
	require.NoError(err)

	s.redpandaContainer = redpandaContainer

	seedBroker, err := redpandaContainer.KafkaSeedBroker(ctx)
	require.NoError(err)

	s.seedBroker = seedBroker
	s.kafkaClient, s.kafkaAdminClient = testutil.CreateClients(t, []string{seedBroker})

	registryAddr, err := redpandaContainer.SchemaRegistryAddress(ctx)
	require.NoError(err)
	s.registryAddress = registryAddr

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	s.log = log
}

func (s *SerdeIntegrationTestSuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	assert.NoError(s.redpandaContainer.Terminate(context.Background()))
}

func (s *SerdeIntegrationTestSuite) TestDeserializeRecord() {
	t := s.T()

	require := require.New(t)
	assert := assert.New(t)

	ctx := context.Background()

	t.Run("plain JSON", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_plain_json")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		order := testutil.Order{ID: strconv.Itoa(123)}
		serializedOrder, err := json.Marshal(order)
		require.NoError(err)

		recordTimeStamp := time.Date(2010, time.November, 10, 13, 0, 0, 0, time.UTC)

		r := &kgo.Record{
			Key:       []byte(order.ID),
			Value:     serializedOrder,
			Topic:     testTopicName,
			Timestamp: recordTimeStamp,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record
		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true, IncludeRawData: true})
		require.NotNil(dr)

		// check value
		assert.IsType(map[string]any{}, dr.Value.DeserializedPayload)

		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")
		assert.Equal("123", obj["ID"])

		assert.Equal(`{"ID":"123"}`, string(dr.Value.NormalizedPayload))

		// check value properties
		assert.Equal(PayloadEncodingJSON, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Equal(serializedOrder, dr.Value.OriginalPayload)
		assert.Equal(len(serializedOrder), dr.Value.PayloadSizeBytes)
		assert.Empty(dr.Value.SchemaID)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 1)
		assert.Equal(string(PayloadEncodingNone), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Value.Troubleshooting[0].Message)

		// check key
		keyObj, ok := (dr.Key.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("123", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// check key properties
		assert.Equal(PayloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Equal([]byte(order.ID), dr.Key.OriginalPayload)
		assert.Equal(len([]byte(order.ID)), dr.Key.PayloadSizeBytes)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(PayloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("payload size is < 5 for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(PayloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_plain_json'. Check your configured protobuf mappings", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(PayloadEncodingProtobufSchema), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(PayloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_plain_json", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(PayloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(PayloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})

	t.Run("plain JSON deserializer option", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_plain_json_deserializer_option")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		order := testutil.Order{ID: strconv.Itoa(123)}
		serializedOrder, err := json.Marshal(order)
		require.NoError(err)

		recordTimeStamp := time.Date(2010, time.November, 10, 13, 0, 0, 0, time.UTC)

		r := &kgo.Record{
			Key:       []byte(order.ID),
			Value:     serializedOrder,
			Topic:     testTopicName,
			Timestamp: recordTimeStamp,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record
		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{
			Troubleshoot:   true,
			IncludeRawData: true,
			ValueEncoding:  PayloadEncodingJSON,
		})
		require.NotNil(dr)

		// check value
		assert.IsType(map[string]any{}, dr.Value.DeserializedPayload)

		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")
		assert.Equal("123", obj["ID"])

		assert.Equal(`{"ID":"123"}`, string(dr.Value.NormalizedPayload))

		// check value properties
		assert.Equal(PayloadEncodingJSON, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Equal(serializedOrder, dr.Value.OriginalPayload)
		assert.Equal(len(serializedOrder), dr.Value.PayloadSizeBytes)
		assert.Empty(dr.Value.SchemaID)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 0)

		// check key
		keyObj, ok := (dr.Key.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("123", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// check key properties
		assert.Equal(PayloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Equal([]byte(order.ID), dr.Key.OriginalPayload)
		assert.Equal(len([]byte(order.ID)), dr.Key.PayloadSizeBytes)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(PayloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("payload size is < 5 for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(PayloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_plain_json_deserializer_option'. Check your configured protobuf mappings", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(PayloadEncodingProtobufSchema), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(PayloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_plain_json_deserializer_option", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(PayloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(PayloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})

	t.Run("plain JSON incorrect value deserializer option", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_plain_json_bad_value_deser")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		order := testutil.Order{ID: strconv.Itoa(123)}
		serializedOrder, err := json.Marshal(order)
		require.NoError(err)

		recordTimeStamp := time.Date(2010, time.November, 10, 13, 0, 0, 0, time.UTC)

		r := &kgo.Record{
			Key:       []byte(order.ID),
			Value:     serializedOrder,
			Topic:     testTopicName,
			Timestamp: recordTimeStamp,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record
		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{
			Troubleshoot:   true,
			IncludeRawData: true,
			ValueEncoding:  PayloadEncodingProtobuf,
		})
		require.NotNil(dr)

		// check value properties
		assert.Equal(PayloadEncoding(""), dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Equal(serializedOrder, dr.Value.OriginalPayload)
		assert.Equal(len(serializedOrder), dr.Value.PayloadSizeBytes)
		assert.Empty(dr.Value.SchemaID)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 1)
		assert.Equal(string(PayloadEncodingProtobuf), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_plain_json_bad_value_deser'. Check your configured protobuf mappings", dr.Value.Troubleshooting[0].Message)
		// assert.Equal(string(PayloadEncodingProtobuf), dr.Value.Troubleshooting[1].SerdeName)
		// assert.Equal("incorrect magic byte for protobuf schema", dr.Value.Troubleshooting[1].Message)

		// check key
		keyObj, ok := (dr.Key.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("123", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// check key properties
		assert.Equal(PayloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Equal([]byte(order.ID), dr.Key.OriginalPayload)
		assert.Equal(len([]byte(order.ID)), dr.Key.PayloadSizeBytes)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(PayloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("payload size is < 5 for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(PayloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_plain_json_bad_value_deser'. Check your configured protobuf mappings", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(PayloadEncodingProtobufSchema), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(PayloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_plain_json_bad_value_deser", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(PayloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(PayloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})

	t.Run("plain protobuf", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_plain_protobuf")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()
		cfg.Kafka.Protobuf.Enabled = true
		cfg.Kafka.Protobuf.Mappings = []config.ProtoTopicMapping{
			{
				TopicName:      testTopicName,
				ValueProtoType: "shop.v1.Order",
			},
		}
		cfg.Kafka.Protobuf.FileSystem.Enabled = true
		cfg.Kafka.Protobuf.FileSystem.RefreshInterval = 1 * time.Minute
		cfg.Kafka.Protobuf.FileSystem.Paths = []string{"testdata/proto"}

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		orderCreatedAt := time.Date(2023, time.June, 10, 13, 0, 0, 0, time.UTC)
		msg := shopv1.Order{
			Id:        "111",
			CreatedAt: timestamppb.New(orderCreatedAt),
		}

		pbData, err := proto.Marshal(&msg)
		require.NoError(err)

		r := &kgo.Record{
			Key:       []byte(msg.Id),
			Value:     pbData,
			Topic:     testTopicName,
			Timestamp: orderCreatedAt,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record
		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true, IncludeRawData: true})
		require.NotNil(dr)

		// check value
		rOrder := shopv1.Order{}
		err = protojson.Unmarshal(dr.Value.NormalizedPayload, &rOrder)
		require.NoError(err)
		assert.Equal("111", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())

		assert.Equal(`{"id":"111","createdAt":"2023-06-10T13:00:00Z"}`, string(dr.Value.NormalizedPayload))

		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")

		assert.Equal(`111`, obj["id"])

		// check value properties
		assert.Equal(PayloadEncodingProtobuf, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Equal(pbData, dr.Value.OriginalPayload)
		assert.Equal(len(pbData), dr.Value.PayloadSizeBytes)
		assert.Empty(dr.Value.SchemaID)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 5)
		assert.Equal(string(PayloadEncodingNone), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Value.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Value.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Value.Troubleshooting[2].SerdeName)
		assert.Equal("incorrect magic byte for json schema", dr.Value.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Value.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Value.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Value.Troubleshooting[4].SerdeName)
		assert.Equal("incorrect magic byte for avro", dr.Value.Troubleshooting[4].Message)

		// check key
		keyObj, ok := (dr.Key.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("111", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// key properties
		assert.Equal(PayloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Equal([]byte(msg.Id), dr.Key.OriginalPayload)
		assert.Equal([]byte(msg.Id), dr.Key.NormalizedPayload)
		assert.Equal(len([]byte(msg.Id)), dr.Key.PayloadSizeBytes)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(PayloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("payload size is < 5 for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(PayloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype mapping found for the record key of topic 'test.redpanda.console.serde_plain_protobuf'", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(PayloadEncodingProtobufSchema), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(PayloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_plain_protobuf", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(PayloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(PayloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})

	t.Run("plain protobuf reference", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_plain_protobuf_ref")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()
		cfg.Kafka.Protobuf.Enabled = true
		cfg.Kafka.Protobuf.Mappings = []config.ProtoTopicMapping{
			{
				TopicName:      testTopicName,
				ValueProtoType: "shop.v2.Order",
			},
		}
		cfg.Kafka.Protobuf.FileSystem.Enabled = true
		cfg.Kafka.Protobuf.FileSystem.RefreshInterval = 1 * time.Minute
		cfg.Kafka.Protobuf.FileSystem.Paths = []string{"testdata/proto"}

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		orderCreatedAt := time.Date(2023, time.July, 15, 10, 0, 0, 0, time.UTC)
		orderUpdatedAt := time.Date(2023, time.July, 15, 11, 0, 0, 0, time.UTC)
		orderDeliveredAt := time.Date(2023, time.July, 15, 12, 0, 0, 0, time.UTC)
		orderCompletedAt := time.Date(2023, time.July, 15, 13, 0, 0, 0, time.UTC)

		msg := shopv2.Order{
			Version:       1,
			Id:            "444",
			CreatedAt:     timestamppb.New(orderCreatedAt),
			LastUpdatedAt: timestamppb.New(orderUpdatedAt),
			DeliveredAt:   timestamppb.New(orderDeliveredAt),
			CompletedAt:   timestamppb.New(orderCompletedAt),
			Customer: &shopv2.Customer{
				Version:      1,
				Id:           "customer_012345",
				FirstName:    "Zig",
				LastName:     "Zag",
				CompanyName:  "Redpanda",
				Email:        "zigzag_test@redpanda.com",
				CustomerType: shopv2.Customer_CUSTOMER_TYPE_BUSINESS,
			},
			OrderValue: 100,
			LineItems: []*shopv2.Order_LineItem{
				{
					ArticleId:    "art_0",
					Name:         "line_0",
					Quantity:     2,
					QuantityUnit: "usd",
					UnitPrice:    10,
					TotalPrice:   20,
				},
				{
					ArticleId:    "art_1",
					Name:         "line_1",
					Quantity:     2,
					QuantityUnit: "usd",
					UnitPrice:    25,
					TotalPrice:   50,
				},
				{
					ArticleId:    "art_2",
					Name:         "line_2",
					Quantity:     3,
					QuantityUnit: "usd",
					UnitPrice:    10,
					TotalPrice:   30,
				},
			},
			Payment: &shopv2.Order_Payment{
				PaymentId: "pay_01234",
				Method:    "card",
			},
			DeliveryAddress: &shopv2.Address{
				Version: 1,
				Id:      "addr_01234",
				Customer: &shopv2.Address_Customer{
					CustomerId:   "customer_012345",
					CustomerType: "business",
				},
				FirstName: "Zig",
				LastName:  "Zag",
				State:     "CA",
				City:      "SomeCity",
				Zip:       "zzyzx",
				Phone:     "123-456-78990",
				CreatedAt: timestamppb.New(orderCreatedAt),
				Revision:  1,
			},
			Revision: 1,
		}

		pbData, err := proto.Marshal(&msg)
		require.NoError(err)

		r := &kgo.Record{
			Key:       []byte(msg.Id),
			Value:     pbData,
			Topic:     testTopicName,
			Timestamp: orderCreatedAt,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record
		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true})
		require.NotNil(dr)

		// check value
		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")

		assert.Equal(`444`, obj["id"])
		assert.Equal(100.0, obj["orderValue"])
		assert.Equal(1.0, obj["version"])

		rOrder := shopv2.Order{}
		err = protojson.Unmarshal(dr.Value.NormalizedPayload, &rOrder)
		require.NoError(err)
		assert.Equal("444", rOrder.GetId())
		assert.Equal(int32(1), rOrder.GetVersion())
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())
		assert.Equal(timestamppb.New(orderUpdatedAt).GetSeconds(), rOrder.GetLastUpdatedAt().GetSeconds())
		assert.Equal(timestamppb.New(orderDeliveredAt).GetSeconds(), rOrder.GetDeliveredAt().GetSeconds())
		assert.Equal(timestamppb.New(orderCompletedAt).GetSeconds(), rOrder.GetCompletedAt().GetSeconds())

		orderCustomer := rOrder.GetCustomer()
		assert.Equal(int32(1), orderCustomer.GetVersion())
		assert.Equal("Zig", orderCustomer.GetFirstName())
		assert.Equal("Zag", orderCustomer.GetLastName())
		assert.Equal("Redpanda", orderCustomer.GetCompanyName())
		assert.Equal("zigzag_test@redpanda.com", orderCustomer.GetEmail())
		assert.Equal(shopv2.Customer_CUSTOMER_TYPE_BUSINESS, orderCustomer.GetCustomerType())

		assert.Equal(int32(100), rOrder.GetOrderValue())
		lineItems := rOrder.GetLineItems()
		require.Len(lineItems, 3)
		li := lineItems[0]
		assert.Equal("art_0", li.GetArticleId())
		assert.Equal("line_0", li.GetName())
		assert.Equal(int32(2), li.GetQuantity())
		assert.Equal("usd", li.GetQuantityUnit())
		assert.Equal(int32(10), li.GetUnitPrice())
		assert.Equal(int32(20), li.GetTotalPrice())
		li = lineItems[1]
		assert.Equal("art_1", li.GetArticleId())
		assert.Equal("line_1", li.GetName())
		assert.Equal(int32(2), li.GetQuantity())
		assert.Equal("usd", li.GetQuantityUnit())
		assert.Equal(int32(25), li.GetUnitPrice())
		assert.Equal(int32(50), li.GetTotalPrice())
		li = lineItems[2]
		assert.Equal("art_2", li.GetArticleId())
		assert.Equal("line_2", li.GetName())
		assert.Equal(int32(3), li.GetQuantity())
		assert.Equal("usd", li.GetQuantityUnit())
		assert.Equal(int32(10), li.GetUnitPrice())
		assert.Equal(int32(30), li.GetTotalPrice())

		orderPayment := rOrder.GetPayment()
		assert.Equal("pay_01234", orderPayment.GetPaymentId())
		assert.Equal("card", orderPayment.GetMethod())

		deliveryAddress := rOrder.GetDeliveryAddress()
		assert.Equal(int32(1), deliveryAddress.GetVersion())
		assert.Equal("addr_01234", deliveryAddress.GetId())
		assert.Equal("customer_012345", deliveryAddress.GetCustomer().GetCustomerId())
		assert.Equal("business", deliveryAddress.GetCustomer().GetCustomerType())
		assert.Equal("Zig", deliveryAddress.GetFirstName())
		assert.Equal("Zag", deliveryAddress.GetLastName())
		assert.Equal("CA", deliveryAddress.GetState())
		assert.Equal("SomeCity", deliveryAddress.GetCity())
		assert.Equal("zzyzx", deliveryAddress.GetZip())
		assert.Equal("123-456-78990", deliveryAddress.GetPhone())
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), deliveryAddress.GetCreatedAt().GetSeconds())
		assert.Equal(int32(1), deliveryAddress.GetRevision())

		assert.Equal(int32(1), rOrder.GetRevision())

		// value properties
		assert.Equal(PayloadEncodingProtobuf, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Empty(dr.Value.OriginalPayload)
		assert.Equal(len(pbData), dr.Value.PayloadSizeBytes)
		assert.Empty(dr.Value.SchemaID)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 5)
		assert.Equal(string(PayloadEncodingNone), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Value.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Value.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Value.Troubleshooting[2].SerdeName)
		assert.Equal("incorrect magic byte for json schema", dr.Value.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Value.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Value.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Value.Troubleshooting[4].SerdeName)
		assert.Equal("incorrect magic byte for avro", dr.Value.Troubleshooting[4].Message)

		// check key
		keyObj, ok := (dr.Key.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("444", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// key properties
		assert.Equal(PayloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Empty(dr.Key.OriginalPayload)
		assert.Equal([]byte(msg.Id), dr.Key.NormalizedPayload)
		assert.Equal(len([]byte(msg.Id)), dr.Key.PayloadSizeBytes)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(PayloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("payload size is < 5 for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(PayloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype mapping found for the record key of topic 'test.redpanda.console.serde_plain_protobuf_ref'", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(PayloadEncodingProtobufSchema), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(PayloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_plain_protobuf_ref", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(PayloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(PayloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})

	t.Run("schema registry protobuf", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_protobuf")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		protoFile, err := os.ReadFile("testdata/proto/shop/v1/order.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&shopv1.Order{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*shopv1.Order))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*shopv1.Order))
			}),
			sr.Index(0),
		)

		orderCreatedAt := time.Date(2023, time.July, 11, 13, 0, 0, 0, time.UTC)
		msg := shopv1.Order{
			Id:        "222",
			CreatedAt: timestamppb.New(orderCreatedAt),
		}

		msgData, err := serde.Encode(&msg)
		require.NoError(err)

		r := &kgo.Record{
			Key:       []byte(msg.Id),
			Value:     msgData,
			Topic:     testTopicName,
			Timestamp: orderCreatedAt,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record

		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true})
		require.NotNil(dr)

		// check value
		rOrder := shopv1.Order{}
		err = protojson.Unmarshal(dr.Value.NormalizedPayload, &rOrder)
		require.NoError(err)
		assert.Equal("222", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())

		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")
		assert.Equal("222", obj["id"])

		// franz-go serde
		rOrder = shopv1.Order{}
		err = serde.Decode(record.Value, &rOrder)
		require.NoError(err)
		assert.Equal("222", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())

		// value properties
		assert.Equal(PayloadEncodingProtobuf, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Empty(dr.Value.OriginalPayload)
		assert.Equal(len(msgData), dr.Value.PayloadSizeBytes)
		assert.Equal(uint32(ss.ID), *dr.Value.SchemaID)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 6)
		assert.Equal(string(PayloadEncodingNone), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Value.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Value.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Value.Troubleshooting[2].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Value.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Value.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Value.Troubleshooting[4].SerdeName)
		assert.Contains(dr.Value.Troubleshooting[4].Message, "getting avro schema from registry: failed to parse schema: avro: unknown type:")
		assert.Equal(string(PayloadEncodingProtobuf), dr.Value.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_schema_protobuf'. Check your configured protobuf mappings", dr.Value.Troubleshooting[5].Message)

		// check key
		keyObj, ok := (dr.Key.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("222", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// key properties
		assert.Equal(PayloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Empty(dr.Key.OriginalPayload)
		assert.Equal([]byte(msg.Id), dr.Key.NormalizedPayload)
		assert.Equal(len([]byte(msg.Id)), dr.Key.PayloadSizeBytes)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(PayloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("payload size is < 5 for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(PayloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_schema_protobuf'. Check your configured protobuf mappings", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(PayloadEncodingProtobufSchema), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("payload size is <= 5", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(PayloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_schema_protobuf", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(PayloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(PayloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})

	t.Run("schema registry protobuf common", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("deserializer_schema_protobuf_common")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		protoFile, err := os.ReadFile("testdata/proto/common/common.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&common.CommonMessage{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*common.CommonMessage))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*common.CommonMessage))
			}),
			sr.Index(0),
		)

		messageCreatedAt := time.Date(2023, time.July, 11, 13, 0, 0, 0, time.UTC)
		msg := common.CommonMessage{
			Id: "345",
			DecVal: &decimal.Decimal{
				Value: "-1.50",
			},
			Color: &color.Color{
				Red:   0.1,
				Green: 0.2,
				Blue:  0.3,
			},
			Dow: dayofweek.DayOfWeek_FRIDAY,
			Fraction: &fraction.Fraction{
				Numerator:   10,
				Denominator: 20,
			},
			Latlng: &latlng.LatLng{
				Latitude:  45.45,
				Longitude: 12.34,
			},
			Price: &money.Money{
				CurrencyCode: "USD",
				Units:        100,
			},
			Month: month.Month_JANUARY,
		}

		msgData, err := serde.Encode(&msg)
		require.NoError(err)

		r := &kgo.Record{
			Key:       []byte(msg.Id),
			Value:     msgData,
			Topic:     testTopicName,
			Timestamp: messageCreatedAt,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record

		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true})
		require.NotNil(dr)

		// check value
		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")
		assert.Equal("345", obj["id"])
		assert.Len(obj["decVal"], 1)
		assert.Len(obj["color"], 4)
		assert.Len(obj["fraction"], 2)
		assert.Len(obj["latlng"], 2)
		assert.Len(obj["price"], 3)
		assert.Equal("JANUARY", obj["month"])

		assert.Equal(PayloadEncodingProtobuf, dr.Value.Encoding)
		cm := common.CommonMessage{}
		err = protojson.Unmarshal(dr.Value.NormalizedPayload, &cm)
		require.NoError(err)
		assert.Equal("345", cm.Id)
		assert.Equal("-1.50", cm.GetDecVal().GetValue())
		assert.Equal(float32(0.1), cm.GetColor().GetRed())
		assert.Equal(float32(0.2), cm.GetColor().GetGreen())
		assert.Equal(float32(0.3), cm.GetColor().GetBlue())
		assert.Equal(int64(10), cm.GetFraction().GetNumerator())
		assert.Equal(int64(20), cm.GetFraction().GetDenominator())
		assert.Equal(45.45, cm.GetLatlng().GetLatitude())
		assert.Equal(12.34, cm.GetLatlng().GetLongitude())
		assert.Equal("USD", cm.GetPrice().GetCurrencyCode())
		assert.Equal(int64(100), cm.GetPrice().GetUnits())
		assert.Equal("JANUARY", cm.GetMonth().String())

		// franz-go serde
		cm = common.CommonMessage{}
		err = serde.Decode(record.Value, &cm)
		require.NoError(err)
		assert.Equal("345", cm.Id)
		assert.Equal("-1.50", cm.GetDecVal().GetValue())
		assert.Equal(float32(0.1), cm.GetColor().GetRed())
		assert.Equal(float32(0.2), cm.GetColor().GetGreen())
		assert.Equal(float32(0.3), cm.GetColor().GetBlue())
		assert.Equal(int64(10), cm.GetFraction().GetNumerator())
		assert.Equal(int64(20), cm.GetFraction().GetDenominator())
		assert.Equal(45.45, cm.GetLatlng().GetLatitude())
		assert.Equal(12.34, cm.GetLatlng().GetLongitude())
		assert.Equal("USD", cm.GetPrice().GetCurrencyCode())
		assert.Equal(int64(100), cm.GetPrice().GetUnits())
		assert.Equal("JANUARY", cm.GetMonth().String())
	})

	t.Run("schema registry protobuf multi", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_protobuf_multi")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		protoFile, err := os.ReadFile("testdata/proto/index/v1/data.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&indexv1.Gadget{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*indexv1.Gadget))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*indexv1.Gadget))
			}),
			sr.Index(2),
		)

		msg := indexv1.Gadget{
			Identity: "gadget_0",
			Gizmo: &indexv1.Gadget_Gizmo{
				Size: 10,
				Item: &indexv1.Item{
					ItemType: indexv1.Item_ITEM_TYPE_PERSONAL,
					Name:     "item_0",
				},
			},
			Widgets: []*indexv1.Widget{
				{
					Id: "wid_0",
				},
				{
					Id: "wid_1",
				},
			},
		}

		msgData, err := serde.Encode(&msg)
		require.NoError(err)

		r := &kgo.Record{
			Key:   []byte(msg.GetIdentity()),
			Value: msgData,
			Topic: testTopicName,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record

		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true})
		require.NotNil(dr)

		// check value
		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")
		assert.Equal("gadget_0", obj["identity"])
		assert.NotEmpty(obj["gizmo"])
		assert.NotEmpty(obj["widgets"])

		rObject := indexv1.Gadget{}
		err = protojson.Unmarshal(dr.Value.NormalizedPayload, &rObject)
		require.NoError(err)
		assert.Equal("gadget_0", rObject.GetIdentity())
		assert.Equal(int32(10), rObject.GetGizmo().GetSize())
		assert.Equal("item_0", rObject.GetGizmo().GetItem().GetName())
		assert.Equal(indexv1.Item_ITEM_TYPE_PERSONAL, rObject.GetGizmo().GetItem().GetItemType())
		widgets := rObject.GetWidgets()

		require.Len(widgets, 2)
		assert.Equal("wid_0", widgets[0].GetId())
		assert.Equal("wid_1", widgets[1].GetId())

		// franz-go serde
		rObject = indexv1.Gadget{}
		err = serde.Decode(record.Value, &rObject)
		require.NoError(err)
		assert.Equal("gadget_0", rObject.GetIdentity())
		assert.Equal(int32(10), rObject.GetGizmo().GetSize())
		assert.Equal("item_0", rObject.GetGizmo().GetItem().GetName())
		assert.Equal(indexv1.Item_ITEM_TYPE_PERSONAL, rObject.GetGizmo().GetItem().GetItemType())
		widgets = rObject.GetWidgets()

		require.Len(widgets, 2)
		assert.Equal("wid_0", widgets[0].GetId())
		assert.Equal("wid_1", widgets[1].GetId())

		// value properties
		assert.Equal(PayloadEncodingProtobuf, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Empty(dr.Value.OriginalPayload)
		assert.Equal(len(msgData), dr.Value.PayloadSizeBytes)
		assert.Equal(uint32(ss.ID), *dr.Value.SchemaID)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 6)
		assert.Equal(string(PayloadEncodingNone), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Value.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Value.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Value.Troubleshooting[2].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Value.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Value.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Value.Troubleshooting[4].SerdeName)
		assert.Contains(dr.Value.Troubleshooting[4].Message, "getting avro schema from registry: failed to parse schema: avro: unknown type:")
		assert.Equal(string(PayloadEncodingProtobuf), dr.Value.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_schema_protobuf_multi'. Check your configured protobuf mappings", dr.Value.Troubleshooting[5].Message)

		// check key
		keyObj, ok := (dr.Key.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("gadget_0", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// key properties
		assert.Equal(PayloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Empty(dr.Key.OriginalPayload)
		assert.Equal([]byte("gadget_0"), dr.Key.NormalizedPayload)
		assert.Equal(len([]byte("gadget_0")), dr.Key.PayloadSizeBytes)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(PayloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("incorrect magic byte for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("incorrect magic byte for avro", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(PayloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_schema_protobuf_multi'. Check your configured protobuf mappings", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(PayloadEncodingProtobufSchema), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("incorrect magic byte for protobuf schema", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(PayloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_schema_protobuf_multi", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(PayloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(PayloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})

	t.Run("schema registry protobuf nested", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_protobuf_nest")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		protoFile, err := os.ReadFile("testdata/proto/index/v1/data.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&indexv1.Gadget_Gizmo{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*indexv1.Gadget_Gizmo))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*indexv1.Gadget_Gizmo))
			}),
			sr.Index(2, 0),
		)

		msg := indexv1.Gadget{
			Identity: "gadget_0",
			Gizmo: &indexv1.Gadget_Gizmo{
				Size: 11,
				Item: &indexv1.Item{
					ItemType: indexv1.Item_ITEM_TYPE_PERSONAL,
					Name:     "item_10",
				},
			},
			Widgets: []*indexv1.Widget{
				{
					Id: "wid_10",
				},
				{
					Id: "wid_11",
				},
			},
		}

		msgData, err := serde.Encode(msg.GetGizmo())
		require.NoError(err)

		r := &kgo.Record{
			// Key:   []byte("item_10"),
			Value: msgData,
			Topic: testTopicName,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record

		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true})
		require.NotNil(dr)

		// check value
		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")
		assert.Equal(11.0, obj["size"])
		assert.NotEmpty(obj["item"])

		rObject := indexv1.Gadget_Gizmo{}
		err = protojson.Unmarshal(dr.Value.NormalizedPayload, &rObject)
		require.NoError(err)
		assert.Equal(int32(11), rObject.GetSize())
		assert.Equal("item_10", rObject.GetItem().GetName())
		assert.Equal(indexv1.Item_ITEM_TYPE_PERSONAL, rObject.GetItem().GetItemType())

		// franz-go serde
		rObject2 := indexv1.Gadget_Gizmo{}
		err = serde.Decode(record.Value, &rObject2)
		require.NoError(err)
		assert.Equal(int32(11), rObject2.GetSize())
		assert.Equal("item_10", rObject2.GetItem().GetName())
		assert.Equal(indexv1.Item_ITEM_TYPE_PERSONAL, rObject2.GetItem().GetItemType())

		// value properties
		assert.Equal(PayloadEncodingProtobuf, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Empty(dr.Value.OriginalPayload)
		assert.Equal(len(msgData), dr.Value.PayloadSizeBytes)
		assert.Equal(uint32(ss.ID), *dr.Value.SchemaID)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 6)
		assert.Equal(string(PayloadEncodingNone), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Value.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Value.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Value.Troubleshooting[2].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Value.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Value.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Value.Troubleshooting[4].SerdeName)
		assert.Contains(dr.Value.Troubleshooting[4].Message, "getting avro schema from registry: failed to parse schema: avro: unknown type:")
		assert.Equal(string(PayloadEncodingProtobuf), dr.Value.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_schema_protobuf_nest'. Check your configured protobuf mappings", dr.Value.Troubleshooting[5].Message)

		// check key
		assert.Equal(PayloadEncodingNone, dr.Key.Encoding)
		assert.Equal(true, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Empty(dr.Key.OriginalPayload)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 0)
	})

	t.Run("schema registry protobuf references", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_protobuf_ref")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		// address
		addressProto := "shop/v2/address.proto"
		protoFile, err := os.ReadFile("testdata/proto/" + addressProto)
		require.NoError(err)

		ssAddress, err := rcl.CreateSchema(context.Background(), addressProto, sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ssAddress)

		// customer
		customerProto := "shop/v2/customer.proto"
		protoFile, err = os.ReadFile("testdata/proto/" + customerProto)
		require.NoError(err)

		ssCustomer, err := rcl.CreateSchema(context.Background(), customerProto, sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ssCustomer)

		// order
		protoFile, err = os.ReadFile("testdata/proto/shop/v2/order.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
			References: []sr.SchemaReference{
				{
					Name:    addressProto,
					Subject: ssAddress.Subject,
					Version: ssAddress.Version,
				},
				{
					Name:    customerProto,
					Subject: ssCustomer.Subject,
					Version: ssCustomer.Version,
				},
			},
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&shopv2.Order{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*shopv2.Order))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*shopv2.Order))
			}),
			sr.Index(0),
		)

		orderCreatedAt := time.Date(2023, time.July, 12, 13, 0, 0, 0, time.UTC)
		orderUpdatedAt := time.Date(2023, time.July, 12, 14, 0, 0, 0, time.UTC)
		orderDeliveredAt := time.Date(2023, time.July, 12, 15, 0, 0, 0, time.UTC)
		orderCompletedAt := time.Date(2023, time.July, 12, 16, 0, 0, 0, time.UTC)

		msg := shopv2.Order{
			Version:       1,
			Id:            "123456789",
			CreatedAt:     timestamppb.New(orderCreatedAt),
			LastUpdatedAt: timestamppb.New(orderUpdatedAt),
			DeliveredAt:   timestamppb.New(orderDeliveredAt),
			CompletedAt:   timestamppb.New(orderCompletedAt),
			Customer: &shopv2.Customer{
				Version:      1,
				Id:           "customer_0123",
				FirstName:    "Foo",
				LastName:     "Bar",
				CompanyName:  "Redpanda",
				Email:        "foobar_test@redpanda.com",
				CustomerType: shopv2.Customer_CUSTOMER_TYPE_BUSINESS,
			},
			OrderValue: 100,
			LineItems: []*shopv2.Order_LineItem{
				{
					ArticleId:    "art0",
					Name:         "line0",
					Quantity:     2,
					QuantityUnit: "usd",
					UnitPrice:    10,
					TotalPrice:   20,
				},
				{
					ArticleId:    "art1",
					Name:         "line1",
					Quantity:     2,
					QuantityUnit: "usd",
					UnitPrice:    25,
					TotalPrice:   50,
				},
				{
					ArticleId:    "art2",
					Name:         "line2",
					Quantity:     3,
					QuantityUnit: "usd",
					UnitPrice:    10,
					TotalPrice:   30,
				},
			},
			Payment: &shopv2.Order_Payment{
				PaymentId: "pay_0123",
				Method:    "card",
			},
			DeliveryAddress: &shopv2.Address{
				Version: 1,
				Id:      "addr_0123",
				Customer: &shopv2.Address_Customer{
					CustomerId:   "customer_0123",
					CustomerType: "business",
				},
				FirstName: "Foo",
				LastName:  "Bar",
				State:     "CA",
				City:      "SomeCity",
				Zip:       "xyzyz",
				Phone:     "123-456-78990",
				CreatedAt: timestamppb.New(orderCreatedAt),
				Revision:  1,
			},
			Revision: 1,
		}

		msgData, err := serde.Encode(&msg)
		require.NoError(err)

		r := &kgo.Record{
			Key:       []byte(msg.Id),
			Value:     msgData,
			Topic:     testTopicName,
			Timestamp: orderCreatedAt,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record

		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true})
		require.NotNil(dr)

		// check value
		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")
		assert.Equal("123456789", obj["id"])
		assert.Equal(1.0, obj["version"])
		assert.Equal(100.0, obj["orderValue"])
		assert.NotEmpty(obj["customer"])

		rOrder := shopv2.Order{}
		err = protojson.Unmarshal(dr.Value.NormalizedPayload, &rOrder)
		require.NoError(err)
		assert.Equal("123456789", rOrder.GetId())
		assert.Equal(int32(1), rOrder.GetVersion())
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())
		assert.Equal(timestamppb.New(orderUpdatedAt).GetSeconds(), rOrder.GetLastUpdatedAt().GetSeconds())
		assert.Equal(timestamppb.New(orderDeliveredAt).GetSeconds(), rOrder.GetDeliveredAt().GetSeconds())
		assert.Equal(timestamppb.New(orderCompletedAt).GetSeconds(), rOrder.GetCompletedAt().GetSeconds())

		orderCustomer := rOrder.GetCustomer()
		assert.Equal(int32(1), orderCustomer.GetVersion())
		assert.Equal("Foo", orderCustomer.GetFirstName())
		assert.Equal("Bar", orderCustomer.GetLastName())
		assert.Equal("Redpanda", orderCustomer.GetCompanyName())
		assert.Equal("foobar_test@redpanda.com", orderCustomer.GetEmail())
		assert.Equal(shopv2.Customer_CUSTOMER_TYPE_BUSINESS, orderCustomer.GetCustomerType())

		assert.Equal(int32(100), rOrder.GetOrderValue())
		lineItems := rOrder.GetLineItems()
		require.Len(lineItems, 3)
		li := lineItems[0]
		assert.Equal("art0", li.GetArticleId())
		assert.Equal("line0", li.GetName())
		assert.Equal(int32(2), li.GetQuantity())
		assert.Equal("usd", li.GetQuantityUnit())
		assert.Equal(int32(10), li.GetUnitPrice())
		assert.Equal(int32(20), li.GetTotalPrice())
		li = lineItems[1]
		assert.Equal("art1", li.GetArticleId())
		assert.Equal("line1", li.GetName())
		assert.Equal(int32(2), li.GetQuantity())
		assert.Equal("usd", li.GetQuantityUnit())
		assert.Equal(int32(25), li.GetUnitPrice())
		assert.Equal(int32(50), li.GetTotalPrice())
		li = lineItems[2]
		assert.Equal("art2", li.GetArticleId())
		assert.Equal("line2", li.GetName())
		assert.Equal(int32(3), li.GetQuantity())
		assert.Equal("usd", li.GetQuantityUnit())
		assert.Equal(int32(10), li.GetUnitPrice())
		assert.Equal(int32(30), li.GetTotalPrice())

		orderPayment := rOrder.GetPayment()
		assert.Equal("pay_0123", orderPayment.GetPaymentId())
		assert.Equal("card", orderPayment.GetMethod())

		deliveryAddress := rOrder.GetDeliveryAddress()
		assert.Equal(int32(1), deliveryAddress.GetVersion())
		assert.Equal("addr_0123", deliveryAddress.GetId())
		assert.Equal("customer_0123", deliveryAddress.GetCustomer().GetCustomerId())
		assert.Equal("business", deliveryAddress.GetCustomer().GetCustomerType())
		assert.Equal("Foo", deliveryAddress.GetFirstName())
		assert.Equal("Bar", deliveryAddress.GetLastName())
		assert.Equal("CA", deliveryAddress.GetState())
		assert.Equal("SomeCity", deliveryAddress.GetCity())
		assert.Equal("xyzyz", deliveryAddress.GetZip())
		assert.Equal("123-456-78990", deliveryAddress.GetPhone())
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), deliveryAddress.GetCreatedAt().GetSeconds())
		assert.Equal(int32(1), deliveryAddress.GetRevision())

		assert.Equal(int32(1), rOrder.GetRevision())

		// value properties
		assert.Equal(PayloadEncodingProtobuf, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Empty(dr.Value.OriginalPayload)
		assert.Equal(len(msgData), dr.Value.PayloadSizeBytes)
		assert.Equal(uint32(ss.ID), *dr.Value.SchemaID)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 6)
		assert.Equal(string(PayloadEncodingNone), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Value.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Value.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Value.Troubleshooting[2].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Value.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Value.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Value.Troubleshooting[4].SerdeName)
		assert.Contains(dr.Value.Troubleshooting[4].Message, "getting avro schema from registry: failed to parse schema: failed to parse schema reference")
		assert.Equal(string(PayloadEncodingProtobuf), dr.Value.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_schema_protobuf_ref'. Check your configured protobuf mappings", dr.Value.Troubleshooting[5].Message)

		// check key
		keyObj, ok := (dr.Key.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("123456789", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// key properties
		assert.Equal(PayloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Empty(dr.Key.OriginalPayload)
		assert.Equal([]byte("123456789"), dr.Key.NormalizedPayload)
		assert.Equal(len([]byte("123456789")), dr.Key.PayloadSizeBytes)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(PayloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("incorrect magic byte for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("incorrect magic byte for avro", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(PayloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_schema_protobuf_ref'. Check your configured protobuf mappings", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(PayloadEncodingProtobufSchema), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("incorrect magic byte for protobuf schema", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(PayloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_schema_protobuf_ref", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(PayloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(PayloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})

	t.Run("schema registry protobuf update", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("deserializer_schema_protobuf_update")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		protoFile, err := os.ReadFile("testdata/proto/shop/v1/order.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&shopv1.Order{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*shopv1.Order))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*shopv1.Order))
			}),
			sr.Index(0),
		)

		orderCreatedAt := time.Date(2023, time.July, 11, 13, 0, 0, 0, time.UTC)
		msg := shopv1.Order{
			Id:        "222",
			CreatedAt: timestamppb.New(orderCreatedAt),
		}

		msgData, err := serde.Encode(&msg)

		r := &kgo.Record{
			Key:       []byte(msg.Id),
			Value:     msgData,
			Topic:     testTopicName,
			Timestamp: orderCreatedAt,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record

		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true})
		require.NotNil(dr)

		// check value
		rOrder := shopv1.Order{}
		err = protojson.Unmarshal(dr.Value.NormalizedPayload, &rOrder)
		require.NoError(err)
		assert.Equal("222", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())

		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")
		assert.Equal("222", obj["id"])

		// franz-go serde
		rOrder = shopv1.Order{}
		err = serde.Decode(record.Value, &rOrder)
		require.NoError(err)
		assert.Equal("222", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())

		// update schema
		protoFile, err = os.ReadFile("testdata/proto_update/shop/v1/order.proto")
		require.NoError(err)

		ss2, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss2)

		// verify update
		srRes, err := rcl.Schemas(sr.WithParams(ctx, sr.ShowDeleted), testTopicName+"-value")
		require.NoError(err)
		assert.Len(srRes, 2)
		assert.Equal(ss.ID, srRes[0].ID)
		assert.Equal(ss2.ID, srRes[1].ID)

		msg2ID := "333"
		order2CreatedAt := time.Date(2023, time.July, 11, 14, 0, 0, 0, time.UTC)
		order2CreatedAtStr := order2CreatedAt.Format(time.DateTime)
		order2CreateInput := fmt.Sprintf(`{"id":"%s","version":22,"created_at":"%s","order_value":3456}`, msg2ID, order2CreatedAtStr)
		msgData, err = serializeShopV1_2(order2CreateInput, ss2.ID)
		require.NoError(err)

		r = &kgo.Record{
			Key:       []byte(msg2ID),
			Value:     msgData,
			Topic:     testTopicName,
			Timestamp: order2CreatedAt,
		}

		produceCtx, produceCancel = context.WithTimeout(context.Background(), 3*time.Second)
		defer produceCancel()

		results = s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel = context.WithTimeout(context.Background(), 2*time.Second)
		defer consumeCancel()

		// create a new client to get the records again
		cl = s.consumerClientForTopic(testTopicName)

		records := make([]*kgo.Record, 0, 2)
		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && len(records) != 2 {
				record = iter.Next()
				records = append(records, record)
			}
		}

		require.NotEmpty(records)
		require.Len(records, 2)

		// proto schema rediscovery is on a timer... this forces a new refresh
		schemaSvc2, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc2, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc2.Start()
		require.NoError(err)

		serdeSvc2 := NewService(schemaSvc2, protoSvc2, mspPackSvc)

		for _, cr := range records {
			cr := cr

			if string(cr.Key) == msg.Id {
				dr := serdeSvc2.DeserializeRecord(context.Background(), cr, DeserializationOptions{Troubleshoot: true})
				require.NotNil(dr)

				// check value
				rOrder := shopv1.Order{}
				err = protojson.Unmarshal(dr.Value.NormalizedPayload, &rOrder)
				require.NoError(err)
				assert.Equal("222", rOrder.Id)
				assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())

				obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
				require.Truef(ok, "parsed payload is not of type map[string]any")
				assert.Equal("222", obj["id"])
			} else if string(cr.Key) == msg2ID {
				dr := serdeSvc2.DeserializeRecord(context.Background(), cr, DeserializationOptions{Troubleshoot: true})
				require.NotNil(dr)

				obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
				require.Truef(ok, "parsed payload is not of type map[string]any")
				assert.Equal("333", obj["id"])
				assert.Equal(float64(3456), obj["orderValue"])
				assert.Equal(float64(22), obj["version"])

				// the JSON tags have to match shopv_1 Order protojson tags
				type v1_2Order struct {
					Version    int32     `json:"version,omitempty"`
					Id         string    `json:"id,omitempty"`
					CreatedAt  time.Time `json:"createdAt,omitempty"`
					OrderValue int32     `json:"orderValue,omitempty"`
				}

				ov12 := v1_2Order{}
				err = json.Unmarshal(dr.Value.NormalizedPayload, &ov12)
				require.NoError(err)
				assert.Equal("333", ov12.Id)
				assert.Equal(int32(3456), ov12.OrderValue)
				assert.Equal(int32(22), ov12.Version)
				assert.Equal(order2CreatedAt.Unix(), ov12.CreatedAt.Unix())

				objStr, err := deserializeShopV1_2(cr.Value, ss2.ID)
				require.NoError(err)

				o2 := v1_2Order{}
				err = json.Unmarshal([]byte(objStr), &o2)
				require.NoError(err)
				assert.Equal("333", o2.Id)
				assert.Equal(int32(3456), o2.OrderValue)
				assert.Equal(int32(22), o2.Version)
				assert.Equal(order2CreatedAt.Unix(), o2.CreatedAt.Unix())
			} else {
				assert.Fail("unknown record:" + string(cr.Key))
			}
		}
	})

	t.Run("numeric key", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_numeric_key")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		keyBytes := make([]byte, 4)
		binary.BigEndian.PutUint32(keyBytes, 160)
		r := &kgo.Record{
			Key:   keyBytes,
			Value: []byte("my text value"),
			Topic: testTopicName,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 7*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record
		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true, IncludeRawData: true})
		require.NotNil(dr)

		// check key
		obj, ok := (dr.Key.DeserializedPayload).(uint32)
		require.Truef(ok, "parsed payload is not of type uint32")
		assert.Equal(uint32(160), obj)

		assert.Equal("160", string(dr.Key.NormalizedPayload))

		// check key properties
		assert.Equal(PayloadEncodingUint, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Equal(keyBytes, dr.Key.OriginalPayload)
		assert.Equal(len(keyBytes), dr.Key.PayloadSizeBytes)
		assert.Empty(dr.Key.SchemaID)

		// check value
		valObj, ok := (dr.Value.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("my text value", string(valObj))
		assert.Empty(dr.Value.SchemaID)

		assert.Equal("my text value", string(dr.Value.NormalizedPayload))

		// check value properties
		assert.Equal(PayloadEncodingText, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Equal([]byte("my text value"), dr.Value.OriginalPayload)
		assert.Equal(len([]byte("my text value")), dr.Value.PayloadSizeBytes)
	})

	t.Run("ambiguous numeric key as text", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_numeric_key_text")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		keyBytes := make([]byte, 4)
		binary.BigEndian.PutUint32(keyBytes, 1952807028)
		r := &kgo.Record{
			Key:   keyBytes,
			Value: []byte("my text value"),
			Topic: testTopicName,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record
		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true, IncludeRawData: true})
		require.NotNil(dr)

		// check key
		obj, ok := (dr.Key.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("text", string(obj))

		assert.Equal("text", string(dr.Key.NormalizedPayload))

		// check key properties
		assert.Equal(PayloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Equal(keyBytes, dr.Key.OriginalPayload)
		assert.Equal(len(keyBytes), dr.Key.PayloadSizeBytes)
		assert.Empty(dr.Key.SchemaID)

		// check value
		valObj, ok := (dr.Value.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("my text value", string(valObj))
		assert.Empty(dr.Value.SchemaID)

		assert.Equal("my text value", string(dr.Value.NormalizedPayload))

		// check value properties
		assert.Equal(PayloadEncodingText, dr.Value.Encoding)
		assert.Equal(false, dr.Value.IsPayloadNull)
		assert.Equal(false, dr.Value.IsPayloadTooLarge)
		assert.Equal([]byte("my text value"), dr.Value.OriginalPayload)
		assert.Equal(len([]byte("my text value")), dr.Value.PayloadSizeBytes)
	})

	t.Run("avro schema references", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_avro_ref")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		eventDataSchemaStr := `
		{
			"namespace": "io.test.event.schema",
			"type": "record",
			"name": "EventData",
			"fields":[
				{
					"name":"id",
					"type": "string"
				},
				{
					"name":"event_type",
					"type":"string"
				},
				{
					"name":"version",
					"type":"string"
				}
			]
		}`

		eventDataSchema, err := avro.Parse(eventDataSchemaStr)
		require.NoError(err)
		require.NotEmpty(eventDataSchema)

		ssEventData, err := rcl.CreateSchema(context.Background(), "io.test.event.schema.EventData", sr.Schema{
			Schema: eventDataSchemaStr,
			Type:   sr.TypeAvro,
		})
		require.NoError(err)
		require.NotNil(ssEventData)

		userSchemaStr := `
		{
			"namespace": "io.test.user.schema",
			"type": "record",
			"name": "User",
			"fields": [
				{
					"name": "name",
					"type": "string"
				},
				{
					"name": "email",
					"type": "string"
				},
				{
					"name": "metadata",
					"type": "io.test.event.schema.EventData"
				}
			]
		}`

		userSchema, err := avro.Parse(userSchemaStr)
		require.NoError(err)
		require.NotEmpty(userSchema)

		ssUser, err := rcl.CreateSchema(context.Background(), "io.test.user.schema.User", sr.Schema{
			Schema: userSchemaStr,
			Type:   sr.TypeAvro,
			References: []sr.SchemaReference{
				{
					Name:    "io.test.event.schema.EventData",
					Subject: ssEventData.Subject,
					Version: ssEventData.Version,
				},
			},
		})
		require.NoError(err)
		require.NotNil(ssUser)

		orderSchemaStr := `
		{
			"namespace": "io.test.order.schema",
			"type": "record",
			"name": "Order",
			"fields": [
				{
					"name": "id",
					"type": "string"
				},
				{
					"name": "price",
					"type": "double"
				},
				{
					"name": "quantity",
					"type": "long"
				},
				{
					"name": "customer",
					"type": "io.test.user.schema.User"
				},
				{
					"name": "metadata",
					"type": "io.test.event.schema.EventData"
				}
			]
		}`

		orderSchema, err := avro.Parse(orderSchemaStr)
		require.NoError(err)
		require.NotEmpty(orderSchema)

		ssOrder, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: orderSchemaStr,
			Type:   sr.TypeAvro,
			References: []sr.SchemaReference{
				{
					Name:    "io.test.event.schema.EventData",
					Subject: ssEventData.Subject,
					Version: ssEventData.Version,
				},
				{
					Name:    "io.test.user.schema.User",
					Subject: ssUser.Subject,
					Version: ssUser.Version,
				},
			},
		})
		require.NoError(err)
		require.NotNil(ssOrder)

		type EventDataRecord struct {
			ID        string `avro:"id" json:"id"`
			EventType string `avro:"event_type" json:"event_type"`
			Version   string `avro:"version" json:"version"`
		}

		type UserRecord struct {
			Name     string          `avro:"name" json:"name"`
			Email    string          `avro:"email" json:"email"`
			Metadata EventDataRecord `avro:"metadata" json:"metadata"`
		}

		type OrderRecord struct {
			ID       string          `avro:"id" json:"id"`
			Price    float64         `avro:"price" json:"price"`
			Quantity int64           `avro:"quantity" json:"quantity"`
			User     UserRecord      `avro:"customer" json:"customer"`
			Metadata EventDataRecord `avro:"metadata" json:"metadata"`
		}

		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		var serde sr.Serde
		serde.Register(
			ssOrder.ID,
			&OrderRecord{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return avro.Marshal(orderSchema, v.(*OrderRecord))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return avro.Unmarshal(orderSchema, b, v.(*OrderRecord))
			}),
		)

		order := OrderRecord{
			ID:       "order_0",
			Price:    10.25,
			Quantity: 5,
			User: UserRecord{
				Name:  "user0",
				Email: "user0@example.com",
				Metadata: EventDataRecord{
					ID:        "user0_event_1234",
					Version:   "1",
					EventType: "user",
				},
			},
			Metadata: EventDataRecord{
				ID:        "order0_event_4321",
				Version:   "1",
				EventType: "order",
			},
		}

		binData, err := serde.Encode(&order)
		require.NoError(err)
		require.NotEmpty(binData)

		r := &kgo.Record{
			Key:   []byte(order.ID),
			Value: binData,
			Topic: testTopicName,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer produceCancel()

		results := s.kafkaClient.ProduceSync(produceCtx, r)
		require.NoError(results.FirstErr())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(testTopicName)

		var record *kgo.Record

		for {
			fetches := cl.PollFetches(consumeCtx)
			errs := fetches.Errors()
			if fetches.IsClientClosed() ||
				(len(errs) == 1 && (errors.Is(errs[0].Err, context.DeadlineExceeded) || errors.Is(errs[0].Err, context.Canceled))) {
				break
			}

			require.Empty(errs)

			iter := fetches.RecordIter()

			for !iter.Done() && record == nil {
				record = iter.Next()
				break
			}
		}

		require.NotEmpty(record)

		dr := serdeSvc.DeserializeRecord(context.Background(), record, DeserializationOptions{Troubleshoot: true})
		require.NotNil(dr)

		// check value
		obj, ok := (dr.Value.DeserializedPayload).(map[string]any)
		require.Truef(ok, "parsed payload is not of type map[string]any")
		assert.Equal("order_0", obj["id"])
		assert.Equal(10.25, obj["price"])
		assert.Equal(int64(5), obj["quantity"])
		assert.NotEmpty(obj["customer"])
		assert.NotEmpty(obj["metadata"])

		orderObj := OrderRecord{}

		err = json.Unmarshal(dr.Value.NormalizedPayload, &orderObj)
		require.NoError(err)

		assert.Equal(order, orderObj)

		// value troubleshooting
		require.Len(dr.Value.Troubleshooting, 4)
		assert.Equal(string(PayloadEncodingNone), dr.Value.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Value.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Value.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Value.Troubleshooting[2].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Value.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Value.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Value.Troubleshooting[3].Message)

		// check key
		keyObj, ok := (dr.Key.DeserializedPayload).([]byte)
		require.Truef(ok, "parsed payload is not of type []byte")
		assert.Equal("order_0", string(keyObj))
		assert.Empty(dr.Key.SchemaID)

		// key properties
		assert.Equal(PayloadEncodingText, dr.Key.Encoding)
		assert.Equal(false, dr.Key.IsPayloadNull)
		assert.Equal(false, dr.Key.IsPayloadTooLarge)
		assert.Empty(dr.Key.OriginalPayload)
		assert.Equal([]byte("order_0"), dr.Key.NormalizedPayload)
		assert.Equal(len([]byte("order_0")), dr.Key.PayloadSizeBytes)

		// key troubleshooting
		require.Len(dr.Key.Troubleshooting, 10)
		assert.Equal(string(PayloadEncodingNone), dr.Key.Troubleshooting[0].SerdeName)
		assert.Equal("payload is not empty as expected for none encoding", dr.Key.Troubleshooting[0].Message)
		assert.Equal(string(PayloadEncodingJSON), dr.Key.Troubleshooting[1].SerdeName)
		assert.Equal("first byte indicates this it not valid JSON, expected brackets", dr.Key.Troubleshooting[1].Message)
		assert.Equal(string(PayloadEncodingJSONSchema), dr.Key.Troubleshooting[2].SerdeName)
		assert.Equal("incorrect magic byte for json schema", dr.Key.Troubleshooting[2].Message)
		assert.Equal(string(PayloadEncodingXML), dr.Key.Troubleshooting[3].SerdeName)
		assert.Equal("first byte indicates this it not valid XML", dr.Key.Troubleshooting[3].Message)
		assert.Equal(string(PayloadEncodingAvro), dr.Key.Troubleshooting[4].SerdeName)
		assert.Equal("incorrect magic byte for avro", dr.Key.Troubleshooting[4].Message)
		assert.Equal(string(PayloadEncodingProtobuf), dr.Key.Troubleshooting[5].SerdeName)
		assert.Equal("failed to get message descriptor for payload: no prototype found for the given topic 'test.redpanda.console.serde_schema_avro_ref'. Check your configured protobuf mappings", dr.Key.Troubleshooting[5].Message)
		assert.Equal(string(PayloadEncodingProtobufSchema), dr.Key.Troubleshooting[6].SerdeName)
		assert.Equal("incorrect magic byte for protobuf schema", dr.Key.Troubleshooting[6].Message)
		assert.Equal(string(PayloadEncodingMsgPack), dr.Key.Troubleshooting[7].SerdeName)
		assert.Equal("message pack encoding not configured for topic: test.redpanda.console.serde_schema_avro_ref", dr.Key.Troubleshooting[7].Message)
		assert.Equal(string(PayloadEncodingSmile), dr.Key.Troubleshooting[8].SerdeName)
		assert.Equal("first bytes indicate this it not valid Smile format", dr.Key.Troubleshooting[8].Message)
		assert.Equal(string(PayloadEncodingUtf8WithControlChars), dr.Key.Troubleshooting[9].SerdeName)
		assert.Equal("payload does not contain UTF8 control characters", dr.Key.Troubleshooting[9].Message)
	})
}

func (s *SerdeIntegrationTestSuite) TestSerializeRecord() {
	t := s.T()

	require := require.New(t)
	assert := assert.New(t)

	ctx := context.Background()

	t.Run("plain JSON", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_plain_json")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		inputData := `{"size":10,"item":{"itemType":"ITEM_TYPE_PERSONAL","name":"item_0"}}`

		serRes, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  []byte("123"),
				Encoding: PayloadEncodingText,
			},
			Value: RecordPayloadInput{
				Payload:  inputData,
				Encoding: PayloadEncodingJSON,
			},
		})

		assert.NoError(err)
		require.NotNil(serRes)

		assert.Equal([]byte("123"), serRes.Key.Payload)
		assert.Equal([]byte(inputData), serRes.Value.Payload)
	})

	t.Run("plain protobuf", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_plain_protobuf")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()
		cfg.Kafka.Protobuf.Enabled = true
		cfg.Kafka.Protobuf.Mappings = []config.ProtoTopicMapping{
			{
				TopicName:      testTopicName,
				ValueProtoType: "shop.v1.Order",
			},
		}
		cfg.Kafka.Protobuf.FileSystem.Enabled = true
		cfg.Kafka.Protobuf.FileSystem.RefreshInterval = 1 * time.Minute
		cfg.Kafka.Protobuf.FileSystem.Paths = []string{"testdata/proto"}

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		inputData := `{"id":"111","createdAt":"2023-06-10T13:00:00Z"}`

		serRes, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  []byte("111"),
				Encoding: PayloadEncodingText,
			},
			Value: RecordPayloadInput{
				Payload:  inputData,
				Encoding: PayloadEncodingProtobuf,
			},
		})

		assert.NoError(err)
		require.NotNil(serRes)

		orderCreatedAt := time.Date(2023, time.June, 10, 13, 0, 0, 0, time.UTC)
		msg := shopv1.Order{
			Id:        "111",
			CreatedAt: timestamppb.New(orderCreatedAt),
		}

		expectData, err := proto.Marshal(&msg)
		require.NoError(err)

		assert.Equal([]byte("111"), serRes.Key.Payload)
		assert.Equal(PayloadEncodingText, serRes.Key.Encoding)
		assert.Equal(expectData, serRes.Value.Payload)
		assert.Equal(PayloadEncodingProtobuf, serRes.Value.Encoding)
	})

	t.Run("plain protobuf reference", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("serde_plain_protobuf_ref")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()
		cfg.Kafka.Protobuf.Enabled = true
		cfg.Kafka.Protobuf.Mappings = []config.ProtoTopicMapping{
			{
				TopicName:      testTopicName,
				ValueProtoType: "shop.v2.Order",
			},
		}
		cfg.Kafka.Protobuf.FileSystem.Enabled = true
		cfg.Kafka.Protobuf.FileSystem.RefreshInterval = 1 * time.Minute
		cfg.Kafka.Protobuf.FileSystem.Paths = []string{"testdata/proto"}

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		inputData := `{"version":1,"id":"444","createdAt":"2023-07-15T10:00:00Z","lastUpdatedAt":"2023-07-15T11:00:00Z","deliveredAt":"2023-07-15T12:00:00Z","completedAt":"2023-07-15T13:00:00Z","customer":{"version":1,"id":"customer_012345","firstName":"Zig","lastName":"Zag","gender":"","companyName":"Redpanda","email":"zigzag_test@redpanda.com","customerType":"CUSTOMER_TYPE_BUSINESS","revision":0},"orderValue":100,"lineItems":[{"articleId":"art_0","name":"line_0","quantity":2,"quantityUnit":"usd","unitPrice":10,"totalPrice":20},{"articleId":"art_1","name":"line_1","quantity":2,"quantityUnit":"usd","unitPrice":25,"totalPrice":50},{"articleId":"art_2","name":"line_2","quantity":3,"quantityUnit":"usd","unitPrice":10,"totalPrice":30}],"payment":{"paymentId":"pay_01234","method":"card"},"deliveryAddress":{"version":1,"id":"addr_01234","customer":{"customerId":"customer_012345","customerType":"business"},"type":"","firstName":"Zig","lastName":"Zag","state":"CA","houseNumber":"","city":"SomeCity","zip":"zzyzx","latitude":0,"longitude":0,"phone":"123-456-78990","additionalAddressInfo":"","createdAt":"2023-07-15T10:00:00Z","revision":1},"revision":1}`

		serRes, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  []byte("444"),
				Encoding: PayloadEncodingText,
			},
			Value: RecordPayloadInput{
				Payload:  inputData,
				Encoding: PayloadEncodingProtobuf,
			},
		})

		assert.NoError(err)
		require.NotNil(serRes)

		orderCreatedAt := time.Date(2023, time.July, 15, 10, 0, 0, 0, time.UTC)
		orderUpdatedAt := time.Date(2023, time.July, 15, 11, 0, 0, 0, time.UTC)
		orderDeliveredAt := time.Date(2023, time.July, 15, 12, 0, 0, 0, time.UTC)
		orderCompletedAt := time.Date(2023, time.July, 15, 13, 0, 0, 0, time.UTC)

		msg := shopv2.Order{
			Version:       1,
			Id:            "444",
			CreatedAt:     timestamppb.New(orderCreatedAt),
			LastUpdatedAt: timestamppb.New(orderUpdatedAt),
			DeliveredAt:   timestamppb.New(orderDeliveredAt),
			CompletedAt:   timestamppb.New(orderCompletedAt),
			Customer: &shopv2.Customer{
				Version:      1,
				Id:           "customer_012345",
				FirstName:    "Zig",
				LastName:     "Zag",
				CompanyName:  "Redpanda",
				Email:        "zigzag_test@redpanda.com",
				CustomerType: shopv2.Customer_CUSTOMER_TYPE_BUSINESS,
			},
			OrderValue: 100,
			LineItems: []*shopv2.Order_LineItem{
				{
					ArticleId:    "art_0",
					Name:         "line_0",
					Quantity:     2,
					QuantityUnit: "usd",
					UnitPrice:    10,
					TotalPrice:   20,
				},
				{
					ArticleId:    "art_1",
					Name:         "line_1",
					Quantity:     2,
					QuantityUnit: "usd",
					UnitPrice:    25,
					TotalPrice:   50,
				},
				{
					ArticleId:    "art_2",
					Name:         "line_2",
					Quantity:     3,
					QuantityUnit: "usd",
					UnitPrice:    10,
					TotalPrice:   30,
				},
			},
			Payment: &shopv2.Order_Payment{
				PaymentId: "pay_01234",
				Method:    "card",
			},
			DeliveryAddress: &shopv2.Address{
				Version: 1,
				Id:      "addr_01234",
				Customer: &shopv2.Address_Customer{
					CustomerId:   "customer_012345",
					CustomerType: "business",
				},
				FirstName: "Zig",
				LastName:  "Zag",
				State:     "CA",
				City:      "SomeCity",
				Zip:       "zzyzx",
				Phone:     "123-456-78990",
				CreatedAt: timestamppb.New(orderCreatedAt),
				Revision:  1,
			},
			Revision: 1,
		}

		expectData, err := proto.Marshal(&msg)
		require.NoError(err)

		assert.Equal([]byte("444"), serRes.Key.Payload)
		assert.Equal(PayloadEncodingText, serRes.Key.Encoding)
		assert.Equal(expectData, serRes.Value.Payload)
		assert.Equal(PayloadEncodingProtobuf, serRes.Value.Encoding)
	})

	t.Run("schema registry protobuf", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_protobuf")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		protoFile, err := os.ReadFile("testdata/proto/shop/v1/order.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		var serde sr.Serde
		serde.Register(
			ss.ID,
			&shopv1.Order{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*shopv1.Order))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*shopv1.Order))
			}),
			sr.Index(0),
		)

		orderCreatedAt := time.Date(2023, time.July, 11, 13, 0, 0, 0, time.UTC)
		msg := shopv1.Order{
			Id:        "222",
			CreatedAt: timestamppb.New(orderCreatedAt),
		}

		expectData, err := serde.Encode(&msg)
		require.NoError(err)

		inputData := `{"id":"222","createdAt":"2023-07-11T13:00:00Z"}`

		serRes, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  []byte("222"),
				Encoding: PayloadEncodingText,
			},
			Value: RecordPayloadInput{
				Payload:  inputData,
				Encoding: PayloadEncodingProtobufSchema,
				Options: []SerdeOpt{
					WithSchemaID(uint32(ss.ID)),
					WithIndex(0),
				},
			},
		})

		assert.NoError(err)
		require.NotNil(serRes)

		assert.Equal([]byte("222"), serRes.Key.Payload)
		assert.Equal(PayloadEncodingText, serRes.Key.Encoding)
		assert.Equal(expectData, serRes.Value.Payload)
		assert.Equal(PayloadEncodingProtobufSchema, serRes.Value.Encoding)
	})

	t.Run("schema registry protobuf common", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_protobuf_common")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		protoFile, err := os.ReadFile("testdata/proto/common/common.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		var serde sr.Serde
		serde.Register(
			ss.ID,
			&common.CommonMessage{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*common.CommonMessage))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*common.CommonMessage))
			}),
			sr.Index(0),
		)

		msg := common.CommonMessage{
			Id: "432",
			DecVal: &decimal.Decimal{
				Value: "-2.50",
			},
			Color: &color.Color{
				Red:   0.2,
				Green: 0.3,
				Blue:  0.4,
			},
			Dow: dayofweek.DayOfWeek_MONDAY,
			Fraction: &fraction.Fraction{
				Numerator:   20,
				Denominator: 30,
			},
			Latlng: &latlng.LatLng{
				Latitude:  45.45,
				Longitude: 12.34,
			},
			Price: &money.Money{
				CurrencyCode: "USD",
				Units:        200,
			},
			Month: month.Month_MARCH,
		}

		expectData, err := serde.Encode(&msg)
		require.NoError(err)

		inputData := `{"id":"432","decVal":{"value":"-2.50"},"color":{"red":0.2,"green":0.3,"blue":0.4},"dow":"MONDAY","fraction":{"numerator":20,"denominator":30},"latlng":{"latitude":45.45,"longitude":12.34},"price":{"currencyCode":"USD","units":200},"month":"MARCH"}`

		serRes, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  []byte("432"),
				Encoding: PayloadEncodingText,
			},
			Value: RecordPayloadInput{
				Payload:  inputData,
				Encoding: PayloadEncodingProtobufSchema,
				Options: []SerdeOpt{
					WithSchemaID(uint32(ss.ID)),
					WithIndex(0),
				},
			},
		})

		assert.NoError(err)
		require.NotNil(serRes)

		actualMsg := common.CommonMessage{}
		err = serde.Decode(serRes.Value.Payload, &actualMsg)
		assert.NoError(err)

		assert.Equal([]byte("432"), serRes.Key.Payload)
		assert.Equal(PayloadEncodingText, serRes.Key.Encoding)
		assert.Equal(expectData, serRes.Value.Payload)
		assert.Equal(PayloadEncodingProtobufSchema, serRes.Value.Encoding)
	})

	t.Run("schema registry protobuf multi", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_protobuf_multi")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		protoFile, err := os.ReadFile("testdata/proto/index/v1/data.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&indexv1.Gadget{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*indexv1.Gadget))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*indexv1.Gadget))
			}),
			sr.Index(2),
		)

		msg := indexv1.Gadget{
			Identity: "gadget_0",
			Gizmo: &indexv1.Gadget_Gizmo{
				Size: 10,
				Item: &indexv1.Item{
					ItemType: indexv1.Item_ITEM_TYPE_PERSONAL,
					Name:     "item_0",
				},
			},
			Widgets: []*indexv1.Widget{
				{
					Id: "wid_0",
				},
				{
					Id: "wid_1",
				},
			},
		}

		expectData, err := serde.Encode(&msg)
		require.NoError(err)

		inputData := `{"identity":"gadget_0","gizmo":{"size":10,"item":{"name":"item_0","itemType":"ITEM_TYPE_PERSONAL"}},"widgets":[{"id":"wid_0"},{"id":"wid_1"}]}`

		serRes, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  []byte("gadget_0"),
				Encoding: PayloadEncodingText,
			},
			Value: RecordPayloadInput{
				Payload:  inputData,
				Encoding: PayloadEncodingProtobufSchema,
				Options: []SerdeOpt{
					WithSchemaID(uint32(ss.ID)),
					WithIndex(2),
				},
			},
		})

		assert.NoError(err)
		require.NotNil(serRes)

		assert.Equal([]byte("gadget_0"), serRes.Key.Payload)
		assert.Equal(PayloadEncodingText, serRes.Key.Encoding)
		assert.Equal(expectData, serRes.Value.Payload)
		assert.Equal(PayloadEncodingProtobufSchema, serRes.Value.Encoding)
	})

	t.Run("schema registry protobuf nested", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_protobuf_nest")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		protoFile, err := os.ReadFile("testdata/proto/index/v1/data.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&indexv1.Gadget_Gizmo{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*indexv1.Gadget_Gizmo))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*indexv1.Gadget_Gizmo))
			}),
			sr.Index(2, 0),
		)

		msg := indexv1.Gadget{
			Identity: "gadget_0",
			Gizmo: &indexv1.Gadget_Gizmo{
				Size: 11,
				Item: &indexv1.Item{
					ItemType: indexv1.Item_ITEM_TYPE_PERSONAL,
					Name:     "item_10",
				},
			},
			Widgets: []*indexv1.Widget{
				{
					Id: "wid_10",
				},
				{
					Id: "wid_11",
				},
			},
		}

		expectData, err := serde.Encode(msg.GetGizmo())
		require.NoError(err)

		inputData := `{"size":11,"item":{"name":"item_10","itemType":"ITEM_TYPE_PERSONAL"}}`

		serRes, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  nil,
				Encoding: PayloadEncodingNone,
			},
			Value: RecordPayloadInput{
				Payload:  inputData,
				Encoding: PayloadEncodingProtobufSchema,
				Options: []SerdeOpt{
					WithSchemaID(uint32(ss.ID)),
					WithIndex(2, 0),
				},
			},
		})

		assert.NoError(err)
		require.NotNil(serRes)

		assert.Equal([]byte(nil), serRes.Key.Payload)
		assert.Equal(PayloadEncodingNone, serRes.Key.Encoding)
		assert.Equal(expectData, serRes.Value.Payload)
		assert.Equal(PayloadEncodingProtobufSchema, serRes.Value.Encoding)
	})

	t.Run("schema registry protobuf references", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_protobuf_ref")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		// address
		addressProto := "shop/v2/address.proto"
		protoFile, err := os.ReadFile("testdata/proto/" + addressProto)
		require.NoError(err)

		ssAddress, err := rcl.CreateSchema(context.Background(), addressProto, sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ssAddress)

		// customer
		customerProto := "shop/v2/customer.proto"
		protoFile, err = os.ReadFile("testdata/proto/" + customerProto)
		require.NoError(err)

		ssCustomer, err := rcl.CreateSchema(context.Background(), customerProto, sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ssCustomer)

		// order
		protoFile, err = os.ReadFile("testdata/proto/shop/v2/order.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
			References: []sr.SchemaReference{
				{
					Name:    addressProto,
					Subject: ssAddress.Subject,
					Version: ssAddress.Version,
				},
				{
					Name:    customerProto,
					Subject: ssCustomer.Subject,
					Version: ssCustomer.Version,
				},
			},
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&shopv2.Order{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*shopv2.Order))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*shopv2.Order))
			}),
			sr.Index(0),
		)

		orderCreatedAt := time.Date(2023, time.July, 12, 13, 0, 0, 0, time.UTC)
		orderUpdatedAt := time.Date(2023, time.July, 12, 14, 0, 0, 0, time.UTC)
		orderDeliveredAt := time.Date(2023, time.July, 12, 15, 0, 0, 0, time.UTC)
		orderCompletedAt := time.Date(2023, time.July, 12, 16, 0, 0, 0, time.UTC)

		msg := shopv2.Order{
			Version:       1,
			Id:            "123456789",
			CreatedAt:     timestamppb.New(orderCreatedAt),
			LastUpdatedAt: timestamppb.New(orderUpdatedAt),
			DeliveredAt:   timestamppb.New(orderDeliveredAt),
			CompletedAt:   timestamppb.New(orderCompletedAt),
			Customer: &shopv2.Customer{
				Version:      1,
				Id:           "customer_0123",
				FirstName:    "Foo",
				LastName:     "Bar",
				CompanyName:  "Redpanda",
				Email:        "foobar_test@redpanda.com",
				CustomerType: shopv2.Customer_CUSTOMER_TYPE_BUSINESS,
			},
			OrderValue: 100,
			LineItems: []*shopv2.Order_LineItem{
				{
					ArticleId:    "art0",
					Name:         "line0",
					Quantity:     2,
					QuantityUnit: "usd",
					UnitPrice:    10,
					TotalPrice:   20,
				},
				{
					ArticleId:    "art1",
					Name:         "line1",
					Quantity:     2,
					QuantityUnit: "usd",
					UnitPrice:    25,
					TotalPrice:   50,
				},
				{
					ArticleId:    "art2",
					Name:         "line2",
					Quantity:     3,
					QuantityUnit: "usd",
					UnitPrice:    10,
					TotalPrice:   30,
				},
			},
			Payment: &shopv2.Order_Payment{
				PaymentId: "pay_0123",
				Method:    "card",
			},
			DeliveryAddress: &shopv2.Address{
				Version: 1,
				Id:      "addr_0123",
				Customer: &shopv2.Address_Customer{
					CustomerId:   "customer_0123",
					CustomerType: "business",
				},
				FirstName: "Foo",
				LastName:  "Bar",
				State:     "CA",
				City:      "SomeCity",
				Zip:       "xyzyz",
				Phone:     "123-456-78990",
				CreatedAt: timestamppb.New(orderCreatedAt),
				Revision:  1,
			},
			Revision: 1,
		}

		expectData, err := serde.Encode(&msg)
		require.NoError(err)

		inputData := `{"version":1,"id":"123456789","createdAt":"2023-07-12T13:00:00Z","lastUpdatedAt":"2023-07-12T14:00:00Z","deliveredAt":"2023-07-12T15:00:00Z","completedAt":"2023-07-12T16:00:00Z","customer":{"version":1,"id":"customer_0123","firstName":"Foo","lastName":"Bar","gender":"","companyName":"Redpanda","email":"foobar_test@redpanda.com","customerType":"CUSTOMER_TYPE_BUSINESS","revision":0},"orderValue":100,"lineItems":[{"articleId":"art0","name":"line0","quantity":2,"quantityUnit":"usd","unitPrice":10,"totalPrice":20},{"articleId":"art1","name":"line1","quantity":2,"quantityUnit":"usd","unitPrice":25,"totalPrice":50},{"articleId":"art2","name":"line2","quantity":3,"quantityUnit":"usd","unitPrice":10,"totalPrice":30}],"payment":{"paymentId":"pay_0123","method":"card"},"deliveryAddress":{"version":1,"id":"addr_0123","customer":{"customerId":"customer_0123","customerType":"business"},"type":"","firstName":"Foo","lastName":"Bar","state":"CA","houseNumber":"","city":"SomeCity","zip":"xyzyz","latitude":0,"longitude":0,"phone":"123-456-78990","additionalAddressInfo":"","createdAt":"2023-07-12T13:00:00Z","revision":1},"revision":1}`

		serRes, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  map[string]interface{}{"id": "123456789"},
				Encoding: PayloadEncodingJSON,
			},
			Value: RecordPayloadInput{
				Payload:  inputData,
				Encoding: PayloadEncodingProtobufSchema,
				Options: []SerdeOpt{
					WithSchemaID(uint32(ss.ID)),
					WithIndex(0),
				},
			},
		})

		assert.NoError(err)
		require.NotNil(serRes)

		assert.Equal([]byte(`{"id":"123456789"}`), serRes.Key.Payload)
		assert.Equal(PayloadEncodingJSON, serRes.Key.Encoding)
		assert.Equal(expectData, serRes.Value.Payload)
		assert.Equal(PayloadEncodingProtobufSchema, serRes.Value.Encoding)
	})

	t.Run("json with schema and index", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_json_index")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		protoFile, err := os.ReadFile("testdata/proto/index/v1/data.proto")
		require.NoError(err)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		// Set up Serde
		var serde sr.Serde
		serde.Register(
			ss.ID,
			&indexv1.Gadget_Gizmo{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*indexv1.Gadget_Gizmo))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*indexv1.Gadget_Gizmo))
			}),
			sr.Index(2, 0),
		)

		msg := indexv1.Gadget{
			Identity: "gadget_0",
			Gizmo: &indexv1.Gadget_Gizmo{
				Size: 10,
				Item: &indexv1.Item{
					ItemType: indexv1.Item_ITEM_TYPE_PERSONAL,
					Name:     "item_0",
				},
			},
			Widgets: []*indexv1.Widget{
				{
					Id: "wid_0",
				},
				{
					Id: "wid_1",
				},
			},
		}

		expectedData, err := serde.Encode(msg.GetGizmo())
		require.NoError(err)

		inputData := `{"size":10,"item":{"itemType":"ITEM_TYPE_PERSONAL","name":"item_0"}}`

		serRes, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  []byte("gadget_0"),
				Encoding: PayloadEncodingText,
			},
			Value: RecordPayloadInput{
				Payload:  inputData,
				Encoding: PayloadEncodingProtobufSchema,
				Options: []SerdeOpt{
					WithSchemaID(uint32(ss.ID)),
					WithIndex(2, 0),
				},
			},
		})

		assert.NoError(err)
		require.NotNil(serRes)

		assert.Equal([]byte("gadget_0"), serRes.Key.Payload)
		assert.Equal(expectedData, serRes.Value.Payload)
	})

	t.Run("json schema with reference", func(t *testing.T) {
		t.Skip("JSON Schemas not supported in Redpanda Schema Registry")

		testTopicName := testutil.TopicNameForTest("serde_schema_json_ref")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		productIDSchema := `{
			"$id": "product_id.json",
			"title": "name",
			"description": "The unique identifier for a product",
			"type": "integer"
		  }`

		productNameSchema := `{
			"$id": "product_name.json",
			"title": "name",
			"description": "Name of the product",
			"type": "string"
		  }`

		productPriceSchema := `{
			"$id": "product_price.json",
			"title": "price",
			"description": "The price of the product",
			"type": "number",
			"exclusiveMinimum": 0
		  }`

		schemaStr := `{
			"$id": "schema.json",
			"title": "Product",
			"description": "A product from Acme's catalog",
			"type": "object",
			"properties": {
			  "productId": { "$ref": "product_id.json" },
			  "productName": { "$ref": "product_name.json" },
			  "price": { "$ref": "product_price.json" }
			},
			"required": [ "productId", "productName" ]
		}`

		fullSchema := `{
			"$id": "https://example.com/product.schema.json",
			"title": "Product",
			"description": "A product from Acme's catalog",
			"type": "object",
			"properties": {
			  "productId": {
				"description": "The unique identifier for a product",
				"type": "integer"
			  },
			  "productName": {
				"description": "Name of the product",
				"type": "string"
			  },
			  "price": {
				"description": "The price of the product",
				"type": "number",
				"exclusiveMinimum": 0
			  }
			},
			"required": [ "productId", "productName" ]
		}`

		ssFull, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: fullSchema,
			Type:   sr.TypeJSON,
		})
		require.NoError(err)
		require.NotNil(ssFull)

		ssID, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: productIDSchema,
			Type:   sr.TypeJSON,
		})
		require.NoError(err)
		require.NotNil(ssID)

		ssName, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: productNameSchema,
			Type:   sr.TypeJSON,
		})
		require.NoError(err)

		ssPrice, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: productPriceSchema,
			Type:   sr.TypeJSON,
		})
		require.NoError(err)
		require.NotNil(ssPrice)

		ss, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: schemaStr,
			Type:   sr.TypeJSON,
			References: []sr.SchemaReference{
				{
					Name:    "product_id.json",
					Subject: ssID.Subject,
					Version: ssID.Version,
				},
				{
					Name:    "product_name.json",
					Subject: ssName.Subject,
					Version: ssName.Version,
				},
				{
					Name:    "product_price.json",
					Subject: ssPrice.Subject,
					Version: ssPrice.Version,
				},
			},
		})
		require.NoError(err)
		require.NotNil(ss)

		// test
		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		type ProductRecord struct {
			ProductID   int     `json:"productId"`
			ProductName string  `json:"productName"`
			Price       float32 `json:"price"`
		}

		var srSerde sr.Serde
		srSerde.Register(
			1000,
			&ProductRecord{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return json.Marshal(v.(*ProductRecord))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return json.Unmarshal(b, v.(*ProductRecord))
			}),
		)

		expectData, err := srSerde.Encode(&ProductRecord{ProductID: 11, ProductName: "foo", Price: 10.25})
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		out, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  "11",
				Encoding: PayloadEncodingText,
			},
			Value: RecordPayloadInput{
				Payload:  `{"productId":11,"productName":"foo","price":10.25}`,
				Encoding: PayloadEncodingJSONSchema,
				Options:  []SerdeOpt{WithSchemaID(uint32(ss.ID))},
			},
		})

		require.NoError(err)

		assert.NotNil(out)

		// key
		assert.Equal([]byte("11"), out.Key.Payload)
		assert.Equal(PayloadEncodingText, out.Key.Encoding)

		// value
		assert.Equal(expectData, out.Value.Payload)
		assert.Equal(PayloadEncodingJSON, out.Key.Encoding)
	})

	t.Run("schema registry avro references", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("serde_schema_avro_ref")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(s.registryAddress))
		require.NoError(err)

		eventDataSchemaStr := `
		{
			"namespace": "io.test.event.schema",
			"type": "record",
			"name": "EventData",
			"fields":[
				{
					"name":"id",
					"type": "string"
				},
				{
					"name":"event_type",
					"type":"string"
				},
				{
					"name":"version",
					"type":"string"
				}
			]
		}`

		eventDataSchema, err := avro.Parse(eventDataSchemaStr)
		require.NoError(err)
		require.NotEmpty(eventDataSchema)

		ssEventData, err := rcl.CreateSchema(context.Background(), "io.test.event.schema.EventData", sr.Schema{
			Schema: eventDataSchemaStr,
			Type:   sr.TypeAvro,
		})
		require.NoError(err)
		require.NotNil(ssEventData)

		userSchemaStr := `
		{
			"namespace": "io.test.user.schema",
			"type": "record",
			"name": "User",
			"fields": [
				{
					"name": "name",
					"type": "string"
				},
				{
					"name": "email",
					"type": "string"
				},
				{
					"name": "metadata",
					"type": "io.test.event.schema.EventData"
				}
			]
		}`

		userSchema, err := avro.Parse(userSchemaStr)
		require.NoError(err)
		require.NotEmpty(userSchema)

		ssUser, err := rcl.CreateSchema(context.Background(), "io.test.user.schema.User", sr.Schema{
			Schema: userSchemaStr,
			Type:   sr.TypeAvro,
			References: []sr.SchemaReference{
				{
					Name:    "io.test.event.schema.EventData",
					Subject: ssEventData.Subject,
					Version: ssEventData.Version,
				},
			},
		})
		require.NoError(err)
		require.NotNil(ssUser)

		orderSchemaStr := `
		{
			"namespace": "io.test.order.schema",
			"type": "record",
			"name": "Order",
			"fields": [
				{
					"name": "id",
					"type": "string"
				},
				{
					"name": "price",
					"type": "double"
				},
				{
					"name": "quantity",
					"type": "long"
				},
				{
					"name": "customer",
					"type": "io.test.user.schema.User"
				},
				{
					"name": "metadata",
					"type": "io.test.event.schema.EventData"
				}
			]
		}`

		orderSchema, err := avro.Parse(orderSchemaStr)
		require.NoError(err)
		require.NotEmpty(orderSchema)

		ssOrder, err := rcl.CreateSchema(context.Background(), testTopicName+"-value", sr.Schema{
			Schema: orderSchemaStr,
			Type:   sr.TypeAvro,
			References: []sr.SchemaReference{
				{
					Name:    "io.test.event.schema.EventData",
					Subject: ssEventData.Subject,
					Version: ssEventData.Version,
				},
				{
					Name:    "io.test.user.schema.User",
					Subject: ssUser.Subject,
					Version: ssUser.Version,
				},
			},
		})
		require.NoError(err)
		require.NotNil(ssOrder)

		type EventDataRecord struct {
			ID        string `avro:"id" json:"id"`
			EventType string `avro:"event_type" json:"event_type"`
			Version   string `avro:"version" json:"version"`
		}

		type UserRecord struct {
			Name     string          `avro:"name" json:"name"`
			Email    string          `avro:"email" json:"email"`
			Metadata EventDataRecord `avro:"metadata" json:"metadata"`
		}

		type OrderRecord struct {
			ID       string          `avro:"id" json:"id"`
			Price    float64         `avro:"price" json:"price"`
			Quantity int64           `avro:"quantity" json:"quantity"`
			User     UserRecord      `avro:"customer" json:"customer"`
			Metadata EventDataRecord `avro:"metadata" json:"metadata"`
		}

		cfg := s.createBaseConfig()

		logger, err := zap.NewProduction()
		require.NoError(err)

		schemaSvc, err := schema.NewService(cfg.Kafka.Schema, logger)
		require.NoError(err)

		protoSvc, err := protoPkg.NewService(cfg.Kafka.Protobuf, logger, schemaSvc)
		require.NoError(err)

		err = protoSvc.Start()
		require.NoError(err)

		mspPackSvc, err := ms.NewService(cfg.Kafka.MessagePack)
		require.NoError(err)

		serdeSvc := NewService(schemaSvc, protoSvc, mspPackSvc)

		inputData := `{"customer":{"email":"user1@example.com","metadata":{"event_type":"user","id":"user1_event_2345","version":"1"},"name":"user1"},"id":"order_1","metadata":{"event_type":"order","id":"order1_event_5432","version":"2"},"price":7.50,"quantity":7}`

		serRes, err := serdeSvc.SerializeRecord(context.Background(), SerializeInput{
			Topic: testTopicName,
			Key: RecordPayloadInput{
				Payload:  map[string]interface{}{"id": "order_1"},
				Encoding: PayloadEncodingJSON,
			},
			Value: RecordPayloadInput{
				Payload:  inputData,
				Encoding: PayloadEncodingAvro,
				Options: []SerdeOpt{
					WithSchemaID(uint32(ssOrder.ID)),
				},
			},
		})

		assert.NoError(err)
		require.NotNil(serRes)

		var serde sr.Serde
		serde.Register(
			ssOrder.ID,
			&OrderRecord{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return avro.Marshal(orderSchema, v.(*OrderRecord))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return avro.Unmarshal(orderSchema, b, v.(*OrderRecord))
			}),
		)

		order := OrderRecord{
			ID:       "order_1",
			Price:    7.50,
			Quantity: 7,
			User: UserRecord{
				Name:  "user1",
				Email: "user1@example.com",
				Metadata: EventDataRecord{
					ID:        "user1_event_2345",
					Version:   "1",
					EventType: "user",
				},
			},
			Metadata: EventDataRecord{
				ID:        "order1_event_5432",
				Version:   "2",
				EventType: "order",
			},
		}

		expectData, err := serde.Encode(&order)
		require.NoError(err)
		require.NotEmpty(expectData)

		assert.Equal([]byte(`{"id":"order_1"}`), serRes.Key.Payload)
		assert.Equal(PayloadEncodingJSON, serRes.Key.Encoding)
		assert.Equal(expectData, serRes.Value.Payload)
		assert.Equal(PayloadEncodingAvro, serRes.Value.Encoding)
	})
}

// We cannot import both shopv1 and shopv1_2 (proto_updated) packages.
// Both packages define the same protobuf types in terms of fully qualified name and proto package name.
// Since Proto types do a global registration, names are expectant to be globally unique within process.
// This makes it difficult to use both generated packages within same test.
// So we have a utility CLI helper to do our serialization and deserialization for us out of test process.
// See: https://protobuf.dev/reference/go/faq#namespace-conflict
func serializeShopV1_2(jsonInput string, schemaID int) ([]byte, error) {
	cmdPath, err := filepath.Abs("./testdata/proto_update/msgbin/main.go")
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(
		"go",
		"run",
		cmdPath,
		"-cmd=serialize",
		"-input="+jsonInput,
		"-schema-id="+strconv.Itoa(schemaID),
	)
	var out strings.Builder
	cmd.Stdout = &out
	err = cmd.Run()
	if err != nil {
		return nil, err
	}
	output := out.String()
	return base64.StdEncoding.DecodeString(output)
}

func deserializeShopV1_2(binInput []byte, schemaID int) (string, error) {
	cmdPath, err := filepath.Abs("./testdata/proto_update/msgbin/main.go")
	if err != nil {
		return "", err
	}

	cmd := exec.Command(
		"go",
		"run",
		cmdPath,
		"-cmd=deserialize",
		"-input="+base64.StdEncoding.EncodeToString(binInput),
		"-schema-id="+strconv.Itoa(schemaID),
	)
	var out strings.Builder
	cmd.Stdout = &out
	var errOut strings.Builder
	cmd.Stderr = &errOut
	err = cmd.Run()
	if err != nil {
		errOutput := errOut.String()
		if errOutput != "" {
			return "", fmt.Errorf("%s: %w", errOutput, err)
		}
		return "", err
	}
	return out.String(), nil
}
