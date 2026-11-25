// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package api

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	v1pb "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	v1ac "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/testutil/schemaseed"
)

// TestListMessages_SchemaLocators lists every fixture scenario through the API.
// Console must find the schema registry context of each topic by itself, and
// report the schema ID, GUID, context and location of each key and value.
func (s *APIIntegrationTestSuite) TestListMessages_SchemaLocators() {
	t := s.T()

	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Minute)
	defer cancel()

	// The suite shares one registry, so keep away from the IDs of other tests.
	const topicPrefix = "api_schema_locators_"
	opts := []schemaseed.Option{schemaseed.WithIDBase(9000), schemaseed.WithTopicPrefix(topicPrefix)}
	fixture, err := schemaseed.Seed(ctx, s.kafkaClient, s.kafkaAdminClient, s.kafkaSRClient, opts...)
	require.NoError(t, err)
	defer func() {
		assert.NoError(t, schemaseed.Reset(context.Background(), s.kafkaAdminClient, s.kafkaSRClient, opts...))
	}()

	client := v1ac.NewConsoleServiceClient(http.DefaultClient, s.httpAddress(), connect.WithGRPCWeb())

	listMessages := func(t *testing.T, topic, filter string) []*v1pb.ListMessagesResponse_DataMessage {
		t.Helper()
		stream, err := client.ListMessages(ctx, connect.NewRequest(&v1pb.ListMessagesRequest{
			Topic:                 topicPrefix + topic,
			StartOffset:           -2,
			PartitionId:           -1,
			MaxResults:            100,
			Troubleshoot:          true,
			FilterInterpreterCode: base64.StdEncoding.EncodeToString([]byte(filter)),
		}))
		require.NoError(t, err)

		var messages []*v1pb.ListMessagesResponse_DataMessage
		for stream.Receive() {
			switch cm := stream.Msg().GetControlMessage().(type) {
			case *v1pb.ListMessagesResponse_Data:
				messages = append(messages, cm.Data)
			case *v1pb.ListMessagesResponse_Error:
				require.Fail(t, "list messages error", cm.Error.GetMessage())
			}
		}
		require.NoError(t, stream.Err())
		require.NoError(t, stream.Close())

		slices.SortFunc(messages, func(a, b *v1pb.ListMessagesResponse_DataMessage) int {
			return int(a.GetOffset() - b.GetOffset())
		})
		return messages
	}

	messagesByTopic := make(map[string][]*v1pb.ListMessagesResponse_DataMessage)
	offsets := make(map[string]int)
	for _, sc := range fixture.Scenarios {
		if _, ok := messagesByTopic[sc.Topic]; !ok {
			messagesByTopic[sc.Topic] = listMessages(t, sc.Topic, "")
		}
		offset := offsets[sc.Topic]
		offsets[sc.Topic]++

		t.Run(fmt.Sprintf("%s/%02d %s", sc.Topic, offset, sc.Name), func(t *testing.T) {
			require.Greater(t, len(messagesByTopic[sc.Topic]), offset)
			message := messagesByTopic[sc.Topic][offset]
			require.EqualValues(t, offset, message.GetOffset())

			assertProtoLocatorWant(t, "key", sc.Key, message.GetKey())
			assertProtoLocatorWant(t, "value", sc.Value, message.GetValue())
		})
	}

	t.Run("filter by schema GUID", func(t *testing.T) {
		var shipmentGUID string
		for _, schema := range fixture.Schemas {
			if schema.Subject == "matrix-proto-staging-value" {
				shipmentGUID = schema.GUID
			}
		}
		require.NotEmpty(t, shipmentGUID)

		// The topic has two Shipment records with a GUID. All other records
		// carry another GUID or a schema ID.
		messages := listMessages(t, "guid-required-unbound", fmt.Sprintf(`return valueSchemaGUID == %q && keySchemaGUID == ""`, shipmentGUID))
		require.Len(t, messages, 2)
		for _, message := range messages {
			assert.Equal(t, shipmentGUID, message.GetValue().GetSchemaGuid())
		}
	})
}

// assertProtoLocatorWant compares a key or value from the API with its correct
// decode result.
func assertProtoLocatorWant(t *testing.T, label string, want schemaseed.Want, got *v1pb.KafkaRecordPayload) {
	t.Helper()

	if want.WrongSchema {
		return
	}

	if want.Error != "" {
		var messages []string
		for _, report := range got.GetTroubleshootReport() {
			messages = append(messages, strings.ToLower(report.GetMessage()))
		}
		assert.Contains(t, strings.Join(messages, "\n"), strings.ToLower(want.Error), "%s troubleshooting", label)
		return
	}
	if want.Encoding == "" {
		return
	}

	encodings := map[string]v1pb.PayloadEncoding{
		"null":     v1pb.PayloadEncoding_PAYLOAD_ENCODING_NULL,
		"json":     v1pb.PayloadEncoding_PAYLOAD_ENCODING_JSON,
		"avro":     v1pb.PayloadEncoding_PAYLOAD_ENCODING_AVRO,
		"protobuf": v1pb.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF,
	}
	locations := map[string]v1pb.SchemaIdLocation{
		"":        v1pb.SchemaIdLocation_SCHEMA_ID_LOCATION_UNSPECIFIED,
		"payload": v1pb.SchemaIdLocation_SCHEMA_ID_LOCATION_PAYLOAD,
		"header":  v1pb.SchemaIdLocation_SCHEMA_ID_LOCATION_HEADER,
	}

	assert.Equal(t, encodings[want.Encoding], got.GetEncoding(), "%s encoding", label)
	if want.SchemaID == 0 {
		assert.Nil(t, got.SchemaId, "%s schema ID", label)
	} else {
		assert.EqualValues(t, want.SchemaID, got.GetSchemaId(), "%s schema ID", label)
	}
	if want.JSON != "" {
		assert.JSONEq(t, want.JSON, string(got.GetNormalizedPayload()), "%s payload", label)
	}
	assert.Equal(t, locations[want.Location], got.GetSchemaIdLocation(), "%s schema ID location", label)
	assert.Equal(t, want.Context, got.GetSchemaContext(), "%s schema context", label)
	if want.GUID == "" {
		assert.Nil(t, got.SchemaGuid, "%s schema GUID", label)
	} else {
		assert.Equal(t, want.GUID, got.GetSchemaGuid(), "%s schema GUID", label)
	}
}
