// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package kafka

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/docker/go-connections/nat"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"go.uber.org/zap"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/redpanda-data/console/backend/pkg/config"
	indexv1 "github.com/redpanda-data/console/backend/pkg/kafka/testdata/proto/gen/index/v1"
	shopv1 "github.com/redpanda-data/console/backend/pkg/kafka/testdata/proto/gen/shop/v1"
	shopv2 "github.com/redpanda-data/console/backend/pkg/kafka/testdata/proto/gen/shop/v2"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type KafkaIntegrationTestSuite struct {
	suite.Suite

	redpandaContainer testcontainers.Container

	kafkaClient      *kgo.Client
	kafkaAdminClient *kadm.Client

	seedBroker      string
	registryAddress string
	log             *zap.Logger
}

func TestSuite(t *testing.T) {
	suite.Run(t, &KafkaIntegrationTestSuite{})
}

func (s *KafkaIntegrationTestSuite) createBaseConfig() config.Config {
	cfg := config.Config{}
	cfg.SetDefaults()
	cfg.MetricsNamespace = testutil.MetricNameForTest("deserializer")
	cfg.Kafka.Brokers = []string{s.seedBroker}
	cfg.Kafka.Protobuf.Enabled = true
	cfg.Kafka.Protobuf.SchemaRegistry.Enabled = true
	cfg.Kafka.Schema.Enabled = true
	cfg.Kafka.Schema.URLs = []string{"http://" + s.registryAddress}

	return cfg
}

func (s *KafkaIntegrationTestSuite) consumerClientForTopic(topicName string) *kgo.Client {
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

func withImage(image string) testcontainers.CustomizeRequestOption {
	return func(req *testcontainers.GenericContainerRequest) {
		req.Image = image
	}
}

func (s *KafkaIntegrationTestSuite) SetupSuite() {
	t := s.T()
	require := require.New(t)

	ctx := context.Background()

	redpandaContainer, err := redpanda.RunContainer(ctx, withImage("redpandadata/redpanda:v23.1.13"))
	require.NoError(err)

	s.redpandaContainer = redpandaContainer

	seedBroker, err := redpandaContainer.KafkaSeedBroker(ctx)
	require.NoError(err)

	s.seedBroker = seedBroker
	s.kafkaClient, s.kafkaAdminClient = testutil.CreateClients(t, []string{seedBroker})

	registryAddr, err := getMappedHostPort(ctx, redpandaContainer, nat.Port("8081/tcp"))
	require.NoError(err)
	s.registryAddress = registryAddr

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	s.log = log
}

func (s *KafkaIntegrationTestSuite) TearDownSuite() {
	t := s.T()
	assert := require.New(t)

	assert.NoError(s.redpandaContainer.Terminate(context.Background()))
}

func (s *KafkaIntegrationTestSuite) TestDeserializeRecord() {
	t := s.T()

	require := require.New(t)
	assert := assert.New(t)

	ctx := context.Background()

	t.Run("plain JSON", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("deserializer_plain_json")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		cfg := s.createBaseConfig()

		metricName := testutil.MetricNameForTest(strings.ReplaceAll("deserializer", " ", ""))

		svc, err := NewService(&cfg, s.log, metricName)
		require.NoError(err)

		svc.Start()

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

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 3*time.Second)
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

		dr := svc.Deserializer.DeserializeRecord(record)
		require.NotNil(dr)
		assert.Equal(messageEncodingJSON, dr.Value.Payload.RecognizedEncoding)
		assert.IsType(map[string]interface{}{}, dr.Value.Object)

		rOrder := testutil.Order{}
		err = json.Unmarshal(dr.Value.Payload.Payload, &rOrder)
		require.NoError(err)
		assert.Equal("123", rOrder.ID)
	})

	t.Run("plain protobuf", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("deserializer_plain_protobuf")
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

		metricName := testutil.MetricNameForTest(strings.ReplaceAll("deserializer", " ", ""))

		svc, err := NewService(&cfg, s.log, metricName)
		require.NoError(err)

		svc.Start()

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

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 3*time.Second)
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

		dr := svc.Deserializer.DeserializeRecord(record)
		require.NotNil(dr)
		assert.Equal(messageEncodingProtobuf, dr.Value.Payload.RecognizedEncoding)
		assert.IsType(map[string]interface{}{}, dr.Value.Object)

		rOrder := shopv1.Order{}
		err = protojson.Unmarshal(dr.Value.Payload.Payload, &rOrder)
		require.NoError(err)
		assert.Equal("111", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())
	})

	t.Run("plain protobuf reference", func(t *testing.T) {
		testTopicName := testutil.TopicNameForTest("deserializer_plain_protobuf")
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

		metricName := testutil.MetricNameForTest(strings.ReplaceAll("deserializer", " ", ""))

		svc, err := NewService(&cfg, s.log, metricName)
		require.NoError(err)

		svc.Start()

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

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 3*time.Second)
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

		dr := svc.Deserializer.DeserializeRecord(record)
		require.NotNil(dr)
		assert.Equal(messageEncodingProtobuf, dr.Value.Payload.RecognizedEncoding)
		assert.IsType(map[string]interface{}{}, dr.Value.Object)

		rOrder := shopv2.Order{}
		err = protojson.Unmarshal(dr.Value.Payload.Payload, &rOrder)
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
	})

	t.Run("schema registry protobuf", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("deserializer_schema_protobuf")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		registryURL := "http://" + s.registryAddress

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(registryURL))
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

		metricName := testutil.MetricNameForTest(strings.ReplaceAll("deserializer", " ", ""))

		svc, err := NewService(&cfg, s.log, metricName)
		require.NoError(err)

		svc.Start()

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

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 3*time.Second)
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

		dr := svc.Deserializer.DeserializeRecord(record)
		require.NotNil(dr)
		assert.Equal(messageEncodingProtobuf, dr.Value.Payload.RecognizedEncoding)
		assert.IsType(map[string]interface{}{}, dr.Value.Object)

		rOrder := shopv1.Order{}
		err = protojson.Unmarshal(dr.Value.Payload.Payload, &rOrder)
		require.NoError(err)
		assert.Equal("222", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())

		// franz-go serde
		rOrder = shopv1.Order{}
		err = serde.Decode(record.Value, &rOrder)
		require.NoError(err)
		assert.Equal("222", rOrder.Id)
		assert.Equal(timestamppb.New(orderCreatedAt).GetSeconds(), rOrder.GetCreatedAt().GetSeconds())
	})

	t.Run("schema registry protobuf multi", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("deserializer_schema_protobuf_multi")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		registryURL := "http://" + s.registryAddress

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(registryURL))
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

		metricName := testutil.MetricNameForTest(strings.ReplaceAll("deserializer", " ", ""))

		svc, err := NewService(&cfg, s.log, metricName)
		require.NoError(err)

		svc.Start()

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

		r := &kgo.Record{
			Key:   []byte(msg.GetIdentity()),
			Value: msgData,
			Topic: testTopicName,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 3*time.Second)
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

		dr := svc.Deserializer.DeserializeRecord(record)
		require.NotNil(dr)
		assert.Equal(messageEncodingProtobuf, dr.Value.Payload.RecognizedEncoding)
		assert.IsType(map[string]interface{}{}, dr.Value.Object)

		rObject := indexv1.Gadget{}
		err = protojson.Unmarshal(dr.Value.Payload.Payload, &rObject)
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
	})

	t.Run("schema registry protobuf nested", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("deserializer_schema_protobuf_nest")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		registryURL := "http://" + s.registryAddress

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(registryURL))
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

		metricName := testutil.MetricNameForTest(strings.ReplaceAll("deserializer", " ", ""))

		svc, err := NewService(&cfg, s.log, metricName)
		require.NoError(err)

		svc.Start()

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

		msgData, err := serde.Encode(msg.GetGizmo())

		r := &kgo.Record{
			// Key:   []byte(msg.GetIdentity()),
			Value: msgData,
			Topic: testTopicName,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 3*time.Second)
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

		dr := svc.Deserializer.DeserializeRecord(record)
		require.NotNil(dr)
		assert.Equal(messageEncodingProtobuf, dr.Value.Payload.RecognizedEncoding)
		assert.IsType(map[string]interface{}{}, dr.Value.Object)

		rObject := indexv1.Gadget_Gizmo{}
		err = protojson.Unmarshal(dr.Value.Payload.Payload, &rObject)
		require.NoError(err)
		assert.Equal(int32(10), rObject.GetSize())
		assert.Equal("item_0", rObject.GetItem().GetName())
		assert.Equal(indexv1.Item_ITEM_TYPE_PERSONAL, rObject.GetItem().GetItemType())

		// franz-go serde
		rObject2 := indexv1.Gadget_Gizmo{}
		err = serde.Decode(record.Value, &rObject2)
		require.NoError(err)
		assert.Equal(int32(10), rObject2.GetSize())
		assert.Equal("item_0", rObject2.GetItem().GetName())
		assert.Equal(indexv1.Item_ITEM_TYPE_PERSONAL, rObject2.GetItem().GetItemType())
	})

	t.Run("schema registry protobuf references", func(t *testing.T) {
		// create the topic
		testTopicName := testutil.TopicNameForTest("deserializer_schema_protobuf_ref")
		_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
		require.NoError(err)

		defer func() {
			_, err := s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
			assert.NoError(err)
		}()

		registryURL := "http://" + s.registryAddress

		// register the protobuf schema
		rcl, err := sr.NewClient(sr.URLs(registryURL))
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

		metricName := testutil.MetricNameForTest(strings.ReplaceAll("deserializer", " ", ""))

		svc, err := NewService(&cfg, s.log, metricName)
		require.NoError(err)

		svc.Start()

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
			Id:            "333",
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

		r := &kgo.Record{
			Key:       []byte(msg.Id),
			Value:     msgData,
			Topic:     testTopicName,
			Timestamp: orderCreatedAt,
		}

		produceCtx, produceCancel := context.WithTimeout(context.Background(), 3*time.Second)
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

		dr := svc.Deserializer.DeserializeRecord(record)
		require.NotNil(dr)
		assert.Equal(messageEncodingProtobuf, dr.Value.Payload.RecognizedEncoding)
		assert.IsType(map[string]interface{}{}, dr.Value.Object)

		rOrder := shopv2.Order{}
		err = protojson.Unmarshal(dr.Value.Payload.Payload, &rOrder)
		require.NoError(err)
		assert.Equal("333", rOrder.GetId())
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
	})
}

func getMappedHostPort(ctx context.Context, c testcontainers.Container, port nat.Port) (string, error) {
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
