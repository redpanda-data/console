// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha"
	v1ac "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha/consolev1alphaconnect"
	"github.com/redpanda-data/console/backend/pkg/testutil"
	things "github.com/redpanda-data/console/backend/pkg/testutil/testdata/proto/gen/things/v1"
)

func (s *APIIntegrationTestSuite) TestListMessages() {
	t := s.T()

	require := require.New(t)
	assert := assert.New(t)

	// setup
	ctx := context.Background()

	client := v1ac.NewConsoleServiceClient(
		http.DefaultClient,
		s.httpAddress(),
		connect.WithGRPCWeb(), // use GRPCWeb because we also expect this endpoint to be called by web client
	)

	topicName := testutil.TopicNameForTest("list_messages_0")
	testutil.CreateTestData(t, context.Background(), s.kafkaClient, s.kafkaAdminClient,
		topicName)

	defer func() {
		s.kafkaAdminClient.DeleteTopics(context.Background(), topicName)
	}()

	t.Run("simple happy path", func(t *testing.T) {
		stream, err := client.ListMessages(ctx, connect.NewRequest(&v1pb.ListMessagesRequest{
			Topic:       topicName,
			StartOffset: -2,
			PartitionId: -1,
			MaxResults:  100,
		}))
		require.NoError(err)

		keys := make([]string, 0, 20)
		phaseCount := 0
		doneCount := 0
		progressCount := 0
		errorCount := 0
		seenZeroOffset := false
		for stream.Receive() {
			msg := stream.Msg()
			switch cm := msg.GetControlMessage().(type) {
			case *v1pb.ListMessagesResponse_Data:
				if seenZeroOffset {
					assert.NotEmpty(cm.Data.Offset)
				}

				if cm.Data.Offset == 0 {
					seenZeroOffset = true
				}

				assert.NotEmpty(cm.Data.Timestamp)
				assert.NotEmpty(cm.Data.Compression)
				assert.NotEmpty(cm.Data.Headers)

				for _, h := range cm.Data.Headers {
					h := h
					assert.NotEmpty(h)
					assert.NotEmpty(h.Key)
					assert.NotEmpty(h.Value)
				}

				key := string(cm.Data.GetKey().GetNormalizedPayload())
				keys = append(keys, key)

				assert.NotEmpty(cm.Data.GetKey())
				assert.NotEmpty(cm.Data.GetKey().GetNormalizedPayload())
				assert.Empty(cm.Data.GetKey().GetOriginalPayload())
				assert.NotEmpty(cm.Data.GetKey().GetPayloadSize())
				assert.Equal(v1pb.PayloadEncoding_PAYLOAD_ENCODING_TEXT, cm.Data.GetKey().GetEncoding())
				assert.False(cm.Data.GetKey().GetIsPayloadTooLarge())
				assert.Empty(cm.Data.GetKey().GetTroubleshootReport())

				assert.NotEmpty(cm.Data.GetValue())
				assert.NotEmpty(cm.Data.GetValue().GetNormalizedPayload())
				assert.Empty(cm.Data.GetValue().GetOriginalPayload())
				assert.NotEmpty(cm.Data.GetValue().GetPayloadSize())
				assert.Equal(v1pb.PayloadEncoding_PAYLOAD_ENCODING_JSON, cm.Data.GetValue().GetEncoding())
				assert.False(cm.Data.GetValue().GetIsPayloadTooLarge())
				assert.Empty(cm.Data.GetValue().GetTroubleshootReport())

				assert.Equal(fmt.Sprintf(`{"ID":"%s"}`, key), string(cm.Data.GetValue().GetNormalizedPayload()))
			case *v1pb.ListMessagesResponse_Done:
				doneCount++

				assert.NotEmpty(cm.Done.GetBytesConsumed())
				assert.NotEmpty(cm.Done.GetMessagesConsumed())
				assert.NotEmpty(cm.Done.GetElapsedMs())
				assert.False(cm.Done.GetIsCancelled())
			case *v1pb.ListMessagesResponse_Phase:
				if phaseCount == 0 {
					assert.Equal("Get Partitions", cm.Phase.GetPhase())
				} else if phaseCount == 1 {
					assert.Equal("Get Watermarks and calculate consuming requests", cm.Phase.GetPhase())
				} else if phaseCount == 2 {
					assert.Equal("Consuming messages", cm.Phase.GetPhase())
				} else {
					assert.Fail("Unknown phase.")
				}

				phaseCount++
			case *v1pb.ListMessagesResponse_Progress:
				progressCount++

				assert.NotEmpty(cm.Progress)
				assert.NotEmpty(cm.Progress.GetBytesConsumed())
				assert.NotEmpty(cm.Progress.GetMessagesConsumed())
			case *v1pb.ListMessagesResponse_Error:
				errorCount++
			}
		}

		assert.Nil(stream.Err())
		assert.Nil(stream.Close())
		assert.Equal(
			[]string{"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"},
			keys)
		assert.Equal(3, phaseCount)
		assert.Equal(0, errorCount)
		assert.Equal(1, doneCount)
		assert.True(seenZeroOffset)
		assert.GreaterOrEqual(progressCount, 0)
	})

	t.Run("with troubleshoot and raw payload", func(t *testing.T) {
		stream, err := client.ListMessages(ctx, connect.NewRequest(&v1pb.ListMessagesRequest{
			Topic:                     topicName,
			StartOffset:               -2,
			PartitionId:               -1,
			MaxResults:                100,
			Troubleshoot:              true,
			IncludeOriginalRawPayload: true,
		}))
		require.NoError(err)

		keys := make([]string, 0, 20)
		phaseCount := 0
		doneCount := 0
		progressCount := 0
		errorCount := 0
		seenZeroOffset := false
		for stream.Receive() {
			msg := stream.Msg()
			switch cm := msg.GetControlMessage().(type) {
			case *v1pb.ListMessagesResponse_Data:
				if seenZeroOffset {
					assert.NotEmpty(cm.Data.Offset)
				}

				if cm.Data.Offset == 0 {
					seenZeroOffset = true
				}

				assert.NotEmpty(cm.Data.Timestamp)
				assert.NotEmpty(cm.Data.Compression)
				assert.NotEmpty(cm.Data.Headers)

				for _, h := range cm.Data.Headers {
					h := h
					assert.NotEmpty(h)
					assert.NotEmpty(h.Key)
					assert.NotEmpty(h.Value)
				}

				key := string(cm.Data.GetKey().GetNormalizedPayload())
				keys = append(keys, key)

				assert.NotEmpty(cm.Data.GetKey())
				assert.NotEmpty(cm.Data.GetKey().GetNormalizedPayload())
				assert.NotEmpty(cm.Data.GetKey().GetOriginalPayload())
				assert.NotEmpty(cm.Data.GetKey().GetPayloadSize())
				assert.Equal(v1pb.PayloadEncoding_PAYLOAD_ENCODING_TEXT, cm.Data.GetKey().GetEncoding())
				assert.False(cm.Data.GetKey().GetIsPayloadTooLarge())
				assert.NotEmpty(cm.Data.GetKey().GetTroubleshootReport())

				assert.NotEmpty(cm.Data.GetValue())
				assert.NotEmpty(cm.Data.GetValue().GetNormalizedPayload())
				assert.NotEmpty(cm.Data.GetValue().GetOriginalPayload())
				assert.NotEmpty(cm.Data.GetValue().GetPayloadSize())
				assert.Equal(v1pb.PayloadEncoding_PAYLOAD_ENCODING_JSON, cm.Data.GetValue().GetEncoding())
				assert.False(cm.Data.GetValue().GetIsPayloadTooLarge())
				assert.NotEmpty(cm.Data.GetValue().GetTroubleshootReport())

				assert.Equal(fmt.Sprintf(`{"ID":"%s"}`, key), string(cm.Data.GetValue().GetNormalizedPayload()))
			case *v1pb.ListMessagesResponse_Done:
				doneCount++

				assert.NotEmpty(cm.Done.GetBytesConsumed())
				assert.NotEmpty(cm.Done.GetMessagesConsumed())
				assert.NotEmpty(cm.Done.GetElapsedMs())
				assert.False(cm.Done.GetIsCancelled())
			case *v1pb.ListMessagesResponse_Phase:
				if phaseCount == 0 {
					assert.Equal("Get Partitions", cm.Phase.GetPhase())
				} else if phaseCount == 1 {
					assert.Equal("Get Watermarks and calculate consuming requests", cm.Phase.GetPhase())
				} else if phaseCount == 2 {
					assert.Equal("Consuming messages", cm.Phase.GetPhase())
				} else {
					assert.Fail("Unknown phase.")
				}

				phaseCount++
			case *v1pb.ListMessagesResponse_Progress:
				progressCount++

				assert.NotEmpty(cm.Progress)
				assert.NotEmpty(cm.Progress.GetBytesConsumed())
				assert.NotEmpty(cm.Progress.GetMessagesConsumed())
			case *v1pb.ListMessagesResponse_Error:
				errorCount++
			}
		}

		assert.Nil(stream.Err())
		assert.Nil(stream.Close())
		assert.Equal(
			[]string{"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"},
			keys)
		assert.Equal(3, phaseCount)
		assert.Equal(0, errorCount)
		assert.Equal(1, doneCount)
		assert.True(seenZeroOffset)
		assert.GreaterOrEqual(progressCount, 0)
	})
}

func (s *APIIntegrationTestSuite) TestPublishMessages() {
	t := s.T()

	require := require.New(t)
	assert := assert.New(t)

	// setup
	ctx := context.Background()

	client := v1ac.NewConsoleServiceClient(
		http.DefaultClient,
		s.httpAddress(),
		connect.WithGRPCWeb(), // use GRPCWeb because we also expect this endpoint to be called by web client
	)

	// This test depends on configs configured

	topicName := testutil.TopicNameForTest("publish_messages_0")
	topicNameProtoPain := testutil.TopicNameForTest("publish_messages_proto_plain")
	topicNameProtoSR := testutil.TopicNameForTest("publish_messages_proto_sr")

	_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, topicName)
	assert.NoError(err)

	_, err = s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, topicNameProtoPain)
	assert.NoError(err)

	_, err = s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, topicNameProtoSR)
	assert.NoError(err)

	defer func() {
		s.kafkaAdminClient.DeleteTopics(context.Background(), topicName)
		s.kafkaAdminClient.DeleteTopics(context.Background(), topicNameProtoPain)
		s.kafkaAdminClient.DeleteTopics(context.Background(), topicNameProtoSR)
	}()

	t.Run("JSON message", func(t *testing.T) {
		res, err := client.PublishMessage(ctx, connect.NewRequest(&v1pb.PublishMessageRequest{
			Topic:       topicName,
			PartitionId: -1,
			Headers: []*v1pb.KafkaRecordHeader{
				{
					Key:   "header_key_0",
					Value: []byte("header_val_0"),
				},
			},
			Key: &v1pb.PublishMessagePayloadOptions{
				Data:     "123",
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_TEXT,
			},
			Value: &v1pb.PublishMessagePayloadOptions{
				Data:     `{"id": 123,"name":"foo"}`,
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_JSON,
			},
		}))
		require.NoError(err)

		require.NotNil(res)
		assert.Equal(topicName, res.Msg.GetTopic())
		assert.Equal(int32(0), res.Msg.GetPartitionId())
		assert.Equal(int64(0), res.Msg.GetOffset())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(topicName)

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
		require.Len(record.Headers, 1)
		assert.Equal("header_key_0", record.Headers[0].Key)
		assert.Equal("header_val_0", string(record.Headers[0].Value))
		assert.Equal("123", string(record.Key))
		assert.Equal(`{"id": 123,"name":"foo"}`, string(record.Value))
	})

	t.Run("protobuf message", func(t *testing.T) {
		res, err := client.PublishMessage(ctx, connect.NewRequest(&v1pb.PublishMessageRequest{
			Topic:       topicNameProtoPain,
			PartitionId: -1,
			Headers: []*v1pb.KafkaRecordHeader{
				{
					Key:   "header_key_1",
					Value: []byte("header_val_1"),
				},
			},
			Key: &v1pb.PublishMessagePayloadOptions{
				Data:     "321",
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_TEXT,
			},
			Value: &v1pb.PublishMessagePayloadOptions{
				Data:     `{"id":"321", "name":"item_0", "version":1, "createdAt":"2023-09-12T10:00:00.0Z"}`,
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF,
			},
		}))
		require.NoError(err)

		require.NotNil(res)
		assert.Equal(topicNameProtoPain, res.Msg.GetTopic())
		assert.Equal(int32(0), res.Msg.GetPartitionId())
		assert.Equal(int64(0), res.Msg.GetOffset())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(topicNameProtoPain)

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
		require.Len(record.Headers, 1)
		assert.Equal("header_key_1", record.Headers[0].Key)
		assert.Equal("header_val_1", string(record.Headers[0].Value))
		assert.Equal("321", string(record.Key))

		objTime := time.Date(2023, time.September, 12, 10, 0, 0, 0, time.UTC)

		expectedData, err := proto.Marshal(&things.Item{
			Id:        "321",
			Name:      "item_0",
			Version:   1,
			CreatedAt: timestamppb.New(objTime),
		})
		require.NoError(err)

		assert.Equal(expectedData, record.Value)

		obj2 := things.Item{}
		err = proto.Unmarshal(record.Value, &obj2)

		require.NoError(err)
		assert.Equal("321", obj2.Id)
		assert.Equal("item_0", obj2.Name)
		assert.Equal(timestamppb.New(objTime), obj2.CreatedAt)
	})

	t.Run("protobuf message - fail", func(t *testing.T) {
		res, err := client.PublishMessage(ctx, connect.NewRequest(&v1pb.PublishMessageRequest{
			Topic:       topicNameProtoPain,
			PartitionId: -1,
			Headers: []*v1pb.KafkaRecordHeader{
				{
					Key:   "header_key_1",
					Value: []byte("header_val_1"),
				},
			},
			Key: &v1pb.PublishMessagePayloadOptions{
				Data:     "321",
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_TEXT,
			},
			Value: &v1pb.PublishMessagePayloadOptions{
				Data:     `{"id":"321", "name":"item_0", "version":1, "createdAt":"2023-09-12T10:00:00"}`, // incorrect format
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF,
			},
		}))

		assert.Nil(res)

		require.Error(err)
		assert.Contains(err.Error(), "invalid_argument: no schema id specified")
		var connectErr *connect.Error
		require.True(errors.As(err, &connectErr))
		details := connectErr.Details()
		assert.Len(details, 2)

		seenInfo := false
		detail := details[0]
		msg, valueErr := detail.Value()
		assert.NoError(valueErr)
		if errInfo, ok := msg.(*errdetails.ErrorInfo); ok {
			seenInfo = true
			assert.Equal("redpanda.com/dataplane", errInfo.GetDomain())
			assert.Contains(errInfo.GetReason(), "failed to serialize string protobuf payload: failed to unmarshal protobuf message from JSON: bad Timestamp: parsing time")
		}

		detail = details[1]
		msg, valueErr = detail.Value()
		assert.NoError(valueErr)
		if errInfo, ok := msg.(*errdetails.ErrorInfo); ok {
			seenInfo = true
			assert.Equal("redpanda.com/dataplane", errInfo.GetDomain())
			assert.Contains(errInfo.GetReason(), "protobuf:no schema id specified")
		}

		require.True(seenInfo)
	})

	t.Run("protobuf message - schema registry", func(t *testing.T) {
		protoFilePath := "../testutil/testdata/proto/things/v1/item.proto"
		absProtoPath, err := filepath.Abs(protoFilePath)
		require.NoError(err)

		protoFile, err := os.ReadFile(filepath.Clean(absProtoPath))
		require.NoError(err)

		ss, err := s.kafkaSRClient.CreateSchema(context.Background(), topicNameProtoSR+"-value", sr.Schema{
			Schema: string(protoFile),
			Type:   sr.TypeProtobuf,
		})
		require.NoError(err)
		require.NotNil(ss)

		// we refresh protobuf descriptors from schema registry every 5s
		timer1 := time.NewTimer(2 * time.Second)
		<-timer1.C

		ssID := int32(ss.ID)
		index := int32(0)

		res, err := client.PublishMessage(ctx, connect.NewRequest(&v1pb.PublishMessageRequest{
			Topic:       topicNameProtoSR,
			PartitionId: -1,
			Headers: []*v1pb.KafkaRecordHeader{
				{
					Key:   "header_key_sr_0",
					Value: []byte("header_val_sr_0"),
				},
			},
			Key: &v1pb.PublishMessagePayloadOptions{
				Data:     "543",
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_TEXT,
			},
			Value: &v1pb.PublishMessagePayloadOptions{
				Data:     `{"id":"543", "name":"item_sr_0", "version":2, "createdAt":"2023-09-12T11:00:00.0Z"}`,
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF,
				SchemaId: &ssID,
				Index:    &index,
			},
		}))
		require.NoError(err)

		require.NotNil(res)
		assert.Equal(topicNameProtoSR, res.Msg.GetTopic())
		assert.Equal(int32(0), res.Msg.GetPartitionId())
		assert.Equal(int64(0), res.Msg.GetOffset())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(topicNameProtoSR)

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
		require.Len(record.Headers, 1)
		assert.Equal("header_key_sr_0", record.Headers[0].Key)
		assert.Equal("header_val_sr_0", string(record.Headers[0].Value))
		assert.Equal("543", string(record.Key))

		objTime := time.Date(2023, time.September, 12, 11, 0, 0, 0, time.UTC)

		var serde sr.Serde
		serde.Register(
			ss.ID,
			&things.Item{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return proto.Marshal(v.(*things.Item))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return proto.Unmarshal(b, v.(*things.Item))
			}),
			sr.Index(0),
		)

		expectedData, err := serde.Encode(&things.Item{
			Id:        "543",
			Name:      "item_sr_0",
			Version:   2,
			CreatedAt: timestamppb.New(objTime),
		})
		require.NoError(err)

		assert.Equal(expectedData, record.Value)

		obj2 := things.Item{}
		err = serde.Decode(record.Value, &obj2)

		require.NoError(err)
		assert.Equal("543", obj2.Id)
		assert.Equal("item_sr_0", obj2.Name)
		assert.Equal(timestamppb.New(objTime), obj2.CreatedAt)
	})
}
