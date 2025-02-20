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
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"sort"
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

	"github.com/redpanda-data/console/backend/pkg/protocmp"
	v1pb "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	v1ac "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	dataplane "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/testutil"
	things "github.com/redpanda-data/console/backend/pkg/testutil/testdata/proto/gen/things/v1"
)

// this is a complex test, no reason to refactor it
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

	topicNameBig := testutil.TopicNameForTest("list_messages_big_0")
	testutil.CreateTestData(t, context.Background(), s.kafkaClient, s.kafkaAdminClient,
		topicNameBig)

	defer func() {
		s.kafkaAdminClient.DeleteTopics(context.Background(), topicName)
		s.kafkaAdminClient.DeleteTopics(context.Background(), topicName)
	}()

	// produce too big of a message
	order := testutil.Order{ID: randomString(21000)}
	serializedOrder, err := json.Marshal(order)
	require.NoError(err)

	r := &kgo.Record{
		Key:   []byte("too_big_0"),
		Value: serializedOrder,
		Topic: topicNameBig,
		Headers: []kgo.RecordHeader{
			{
				Key:   "revision",
				Value: []byte("0"),
			},
		},
	}
	results := s.kafkaClient.ProduceSync(ctx, r)
	require.NoError(results.FirstErr())

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

				assert.Equal(fmt.Sprintf(`{"ID":%q}`, key), string(cm.Data.GetValue().GetNormalizedPayload()))
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

				assert.Equal(fmt.Sprintf(`{"ID":%q}`, key), string(cm.Data.GetValue().GetNormalizedPayload()))
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

	t.Run("with key filter", func(t *testing.T) {
		filterCode := base64.StdEncoding.EncodeToString([]byte(
			`return key.endsWith('2') || key.endsWith('3')`,
		))

		stream, err := client.ListMessages(ctx, connect.NewRequest(&v1pb.ListMessagesRequest{
			Topic:                 topicName,
			StartOffset:           -2,
			PartitionId:           -1,
			MaxResults:            100,
			FilterInterpreterCode: filterCode,
		}))
		require.NoError(err)

		keys := make([]string, 0, 4)
		phaseCount := 0
		doneCount := 0
		progressCount := 0
		errorCount := 0

		for stream.Receive() {
			msg := stream.Msg()
			switch cm := msg.GetControlMessage().(type) {
			case *v1pb.ListMessagesResponse_Data:
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

				assert.Equal(fmt.Sprintf(`{"ID":%q}`, key), string(cm.Data.GetValue().GetNormalizedPayload()))
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

		sort.Strings(keys)

		assert.Equal([]string{"12", "13", "2", "3"}, keys)
		assert.Equal(3, phaseCount)
		assert.Equal(0, errorCount)
		assert.Equal(1, doneCount)
		assert.GreaterOrEqual(progressCount, 0)
	})

	t.Run("too big", func(t *testing.T) {
		stream, err := client.ListMessages(ctx, connect.NewRequest(&v1pb.ListMessagesRequest{
			Topic:       topicNameBig,
			StartOffset: -1,
			PartitionId: -1,
			MaxResults:  5,
		}))
		require.NoError(err)

		keys := make([]string, 0, 5)
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
				assert.Empty(cm.Data.GetValue().GetOriginalPayload())
				assert.NotEmpty(cm.Data.GetValue().GetPayloadSize())
				assert.Equal(v1pb.PayloadEncoding_PAYLOAD_ENCODING_JSON, cm.Data.GetValue().GetEncoding())
				assert.Empty(cm.Data.GetValue().GetTroubleshootReport())

				if key == "too_big_0" {
					assert.True(cm.Data.GetValue().GetIsPayloadTooLarge())
					assert.Empty(cm.Data.GetValue().GetNormalizedPayload())
				} else {
					assert.False(cm.Data.GetValue().GetIsPayloadTooLarge())
					assert.NotEmpty(cm.Data.GetValue().GetNormalizedPayload())
				}

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
		assert.Equal([]string{"16", "17", "18", "19", "too_big_0"}, keys)
		assert.Equal(3, phaseCount)
		assert.Equal(0, errorCount)
		assert.Equal(1, doneCount)
		assert.False(seenZeroOffset)
		assert.GreaterOrEqual(progressCount, 0)
	})

	t.Run("too big with ignore", func(t *testing.T) {
		stream, err := client.ListMessages(ctx, connect.NewRequest(&v1pb.ListMessagesRequest{
			Topic:              topicNameBig,
			StartOffset:        -1,
			PartitionId:        -1,
			MaxResults:         5,
			IgnoreMaxSizeLimit: true,
		}))
		require.NoError(err)

		keys := make([]string, 0, 5)
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
				assert.Empty(cm.Data.GetValue().GetOriginalPayload())
				assert.NotEmpty(cm.Data.GetValue().GetPayloadSize())
				assert.Equal(v1pb.PayloadEncoding_PAYLOAD_ENCODING_JSON, cm.Data.GetValue().GetEncoding())
				assert.Empty(cm.Data.GetValue().GetTroubleshootReport())
				assert.False(cm.Data.GetValue().GetIsPayloadTooLarge())
				assert.NotEmpty(cm.Data.GetValue().GetNormalizedPayload())

				if key == "too_big_0" {
					// {"ID":"..."}
					// large string of 21000 chars + 9 extra chars
					assert.Len(cm.Data.GetValue().GetNormalizedPayload(), 21009)
				}

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
		assert.Equal([]string{"16", "17", "18", "19", "too_big_0"}, keys)
		assert.Equal(3, phaseCount)
		assert.Equal(0, errorCount)
		assert.Equal(1, doneCount)
		assert.False(seenZeroOffset)
		assert.GreaterOrEqual(progressCount, 0)
	})

	t.Run("invalid code in filter", func(t *testing.T) {
		filterCode := base64.StdEncoding.EncodeToString([]byte(
			`foo bar`,
		))

		stream, err := client.ListMessages(ctx, connect.NewRequest(&v1pb.ListMessagesRequest{
			Topic:                 topicName,
			StartOffset:           -2,
			PartitionId:           -1,
			MaxResults:            100,
			FilterInterpreterCode: filterCode,
		}))
		require.NoError(err)

		phaseCount := 0
		doneCount := 0
		progressCount := 0
		errorCount := 0
		dataCount := 0

		for stream.Receive() {
			msg := stream.Msg()
			switch cm := msg.GetControlMessage().(type) {
			case *v1pb.ListMessagesResponse_Data:
				dataCount++
			case *v1pb.ListMessagesResponse_Done:
				doneCount++

				assert.NotEmpty(cm.Done.GetBytesConsumed())
				assert.NotEmpty(cm.Done.GetMessagesConsumed())
				assert.NotEmpty(cm.Done.GetElapsedMs())
				assert.False(cm.Done.GetIsCancelled())
			case *v1pb.ListMessagesResponse_Phase:
				phaseCount++
			case *v1pb.ListMessagesResponse_Progress:
				progressCount++
			case *v1pb.ListMessagesResponse_Error:
				errorCount++
			}
		}

		err = stream.Err()
		assert.Error(err)
		connectErr := new(connect.Error)
		ok := errors.As(err, &connectErr)
		require.True(ok)

		assert.Equal(connect.CodeInvalidArgument, connectErr.Code())
		assert.Equal("failed to compile provided interpreter code: SyntaxError: (anonymous): Line 1:35 Unexpected identifier", connectErr.Message())
		assert.NotEmpty(connectErr.Details())

		assert.Nil(stream.Close())

		assert.Equal(0, phaseCount)
		assert.Equal(0, errorCount)
		assert.Equal(0, doneCount)
		assert.Equal(0, dataCount)
		assert.GreaterOrEqual(progressCount, 0)
	})

	t.Run("invalid base64 filter", func(t *testing.T) {
		stream, err := client.ListMessages(ctx, connect.NewRequest(&v1pb.ListMessagesRequest{
			Topic:                 topicName,
			StartOffset:           -2,
			PartitionId:           -1,
			MaxResults:            100,
			FilterInterpreterCode: "foobar",
		}))
		require.NoError(err)

		phaseCount := 0
		doneCount := 0
		progressCount := 0
		errorCount := 0
		dataCount := 0

		for stream.Receive() {
			msg := stream.Msg()
			switch cm := msg.GetControlMessage().(type) {
			case *v1pb.ListMessagesResponse_Data:
				dataCount++
			case *v1pb.ListMessagesResponse_Done:
				doneCount++

				assert.NotEmpty(cm.Done.GetBytesConsumed())
				assert.NotEmpty(cm.Done.GetMessagesConsumed())
				assert.NotEmpty(cm.Done.GetElapsedMs())
				assert.False(cm.Done.GetIsCancelled())
			case *v1pb.ListMessagesResponse_Phase:
				phaseCount++
			case *v1pb.ListMessagesResponse_Progress:
				progressCount++
			case *v1pb.ListMessagesResponse_Error:
				errorCount++
			}
		}

		err = stream.Err()
		assert.Error(err)
		connectErr := new(connect.Error)
		ok := errors.As(err, &connectErr)
		require.True(ok)

		assert.Equal(connect.CodeInvalidArgument, connectErr.Code())
		assert.Equal("failed decoding provided interpreter code: illegal base64 data at input byte 4", connectErr.Message())
		assert.NotEmpty(connectErr.Details())

		assert.Nil(stream.Close())

		assert.Equal(0, phaseCount)
		assert.Equal(0, errorCount)
		assert.Equal(0, doneCount)
		assert.Equal(0, dataCount)
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
	topicNameProtoPlain := testutil.TopicNameForTest("publish_messages_proto_plain")
	topicNameProtoSR := testutil.TopicNameForTest("publish_messages_proto_sr")

	_, err := s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, topicName)
	assert.NoError(err)

	_, err = s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, topicNameProtoPlain)
	assert.NoError(err)

	_, err = s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, topicNameProtoSR)
	assert.NoError(err)

	defer func() {
		s.kafkaAdminClient.DeleteTopics(context.Background(), topicName)
		s.kafkaAdminClient.DeleteTopics(context.Background(), topicNameProtoPlain)
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
				Data:     []byte("123"),
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_TEXT,
			},
			Value: &v1pb.PublishMessagePayloadOptions{
				Data:     []byte(`{"id": 123,"name":"foo"}`),
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
			Topic:       topicNameProtoPlain,
			PartitionId: -1,
			Headers: []*v1pb.KafkaRecordHeader{
				{
					Key:   "header_key_1",
					Value: []byte("header_val_1"),
				},
			},
			Key: &v1pb.PublishMessagePayloadOptions{
				Data:     []byte("321"),
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_TEXT,
			},
			Value: &v1pb.PublishMessagePayloadOptions{
				Data:     []byte(`{"id":"321", "name":"item_0", "version":1, "createdAt":"2023-09-12T10:00:00.0Z"}`),
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF,
			},
		}))
		require.NoError(err)

		require.NotNil(res)
		assert.Equal(topicNameProtoPlain, res.Msg.GetTopic())
		assert.Equal(int32(0), res.Msg.GetPartitionId())
		assert.Equal(int64(0), res.Msg.GetOffset())

		consumeCtx, consumeCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer consumeCancel()

		cl := s.consumerClientForTopic(topicNameProtoPlain)

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
			Topic:       topicNameProtoPlain,
			PartitionId: -1,
			Headers: []*v1pb.KafkaRecordHeader{
				{
					Key:   "header_key_1",
					Value: []byte("header_val_1"),
				},
			},
			Key: &v1pb.PublishMessagePayloadOptions{
				Data:     []byte("321"),
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_TEXT,
			},
			Value: &v1pb.PublishMessagePayloadOptions{
				Data:     []byte(`{"id":"321", "name":"item_0", "version":1, "createdAt":"2023-09-12T10:00:00"}`), // incorrect format
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF,
			},
		}))

		assert.Nil(res)

		require.Error(err)
		assert.Contains(err.Error(), "invalid_argument: failed to serialize json protobuf payload: failed to unmarshal protobuf message from JSON: bad Timestamp: parsing time")
		var connectErr *connect.Error
		require.True(errors.As(err, &connectErr))
		details := connectErr.Details()
		require.Len(details, 1)

		seenInfo := false
		detail := details[0]
		msg, valueErr := detail.Value()
		assert.NoError(valueErr)
		if errInfo, ok := msg.(*errdetails.ErrorInfo); ok {
			seenInfo = true
			assert.Equal("redpanda.com/dataplane", errInfo.GetDomain())
			assert.Contains(errInfo.GetReason(), dataplane.Reason_REASON_CONSOLE_ERROR.String())
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
				Data:     []byte("543"),
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_TEXT,
			},
			Value: &v1pb.PublishMessagePayloadOptions{
				Data:     []byte(`{"id":"543", "name":"item_sr_0", "version":2, "createdAt":"2023-09-12T11:00:00.0Z"}`),
				Encoding: v1pb.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF_SCHEMA,
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

		originalObject := &things.Item{
			Id:        "543",
			Name:      "item_sr_0",
			Version:   2,
			CreatedAt: timestamppb.New(objTime),
		}
		expectedData, err := serde.Encode(originalObject)
		require.NoError(err)

		assert.Equal(len(expectedData), len(record.Value))

		obj2 := things.Item{}
		err = serde.Decode(record.Value, &obj2)

		require.NoError(err)
		assert.Equal("543", obj2.Id)
		assert.Equal("item_sr_0", obj2.Name)
		assert.Equal(timestamppb.New(objTime), obj2.CreatedAt)

		protocmp.AssertProtoEqual(t, originalObject, &obj2)
	})
}

const letterBytes = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

func randomString(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = letterBytes[rand.Intn(len(letterBytes))]
	}
	return string(b)
}
