// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package serde

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/redpanda-data/console/backend/pkg/config"
	protoPkg "github.com/redpanda-data/console/backend/pkg/proto"
	"github.com/redpanda-data/console/backend/pkg/schema"
	shopv1 "github.com/redpanda-data/console/backend/pkg/serde/testdata/proto/gen/shop/v1"
)

func TestProtobufSerde_DeserializePayload(t *testing.T) {
	// NO OP schema registry API server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer ts.Close()

	logger, err := zap.NewProduction()
	require.NoError(t, err)

	schemaSvc, err := schema.NewService(config.Schema{
		Enabled: false,
		URLs:    []string{ts.URL},
	}, logger)
	require.NoError(t, err)

	protoSvc, err := protoPkg.NewService(config.Proto{
		Enabled: true,
		SchemaRegistry: config.ProtoSchemaRegistry{
			Enabled:         false,
			RefreshInterval: 5 * time.Minute,
		},
		FileSystem: config.Filesystem{
			Enabled:         true,
			Paths:           []string{"testdata/proto"},
			RefreshInterval: 5 * time.Minute,
		},
		Mappings: []config.ProtoTopicMapping{
			{
				TopicName:      "protobuf_serde_test_orders",
				ValueProtoType: "shop.v1.Order",
			},
			{
				TopicName:      "protobuf_serde_test_orders_2",
				KeyProtoType:   "shop.v1.Order",
				ValueProtoType: "shop.v1.Order",
			},
		},
	}, logger, schemaSvc)
	require.NoError(t, err)

	err = protoSvc.Start()
	require.NoError(t, err)

	// serde
	serde := ProtobufSerde{
		ProtoSvc: protoSvc,
	}

	orderCreatedAt := time.Date(2023, time.June, 10, 13, 0, 0, 0, time.UTC)
	msg := shopv1.Order{
		Id:        "111",
		CreatedAt: timestamppb.New(orderCreatedAt),
	}

	msgData, err := proto.Marshal(&msg)
	require.NoError(t, err)

	orderCreatedAt = time.Date(2023, time.June, 10, 14, 0, 0, 0, time.UTC)
	msg = shopv1.Order{
		Id:        "222",
		CreatedAt: timestamppb.New(orderCreatedAt),
	}
	msgData2, err := proto.Marshal(&msg)
	require.NoError(t, err)

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    payloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "protobuf in value",
			record: &kgo.Record{
				Value: msgData,
				Topic: "protobuf_serde_test_orders",
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, payloadEncodingProtobuf, payload.Encoding)

				obj, ok := (payload.ParsedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")

				assert.Equal(t, `{"id":"111","createdAt":"2023-06-10T13:00:00Z"}`, string(obj))
			},
		},
		{
			name: "protobuf in key",
			record: &kgo.Record{
				Key:   msgData2,
				Value: msgData,
				Topic: "protobuf_serde_test_orders_2",
			},
			payloadType: payloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, payloadEncodingProtobuf, payload.Encoding)

				obj, ok := (payload.ParsedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")

				assert.Equal(t, `{"id":"222","createdAt":"2023-06-10T14:00:00Z"}`, string(obj))
			},
		},
		{
			name: "not in map",
			record: &kgo.Record{
				Key:   msgData,
				Value: msgData2,
				Topic: "protobuf_serde_test_orders_123",
			},
			payloadType: payloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.Error(t, err)
				assert.Equal(t, "failed to get message descriptor for payload: no prototype found for the given topic. Check your configured protobuf mappings", err.Error())
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := serde.DeserializePayload(test.record, test.payloadType)
			test.validationFunc(t, payload, err)
		})
	}
}
