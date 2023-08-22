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

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/jhump/protoreflect/dynamic"
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
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "protobuf in value",
			record: &kgo.Record{
				Value: msgData,
				Topic: "protobuf_serde_test_orders",
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingProtobuf, payload.Encoding)

				assert.Equal(t, `{"id":"111","createdAt":"2023-06-10T13:00:00Z"}`, string(payload.NormalizedPayload))

				obj, ok := (payload.DeserializedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")

				assert.Equal(t, `111`, obj["id"])
			},
		},
		{
			name: "protobuf in key",
			record: &kgo.Record{
				Key:   msgData2,
				Value: msgData,
				Topic: "protobuf_serde_test_orders_2",
			},
			payloadType: PayloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingProtobuf, payload.Encoding)

				assert.Equal(t, `{"id":"222","createdAt":"2023-06-10T14:00:00Z"}`, string(payload.NormalizedPayload))

				obj, ok := (payload.DeserializedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")

				assert.Equal(t, `222`, obj["id"])
			},
		},
		{
			name: "not in map",
			record: &kgo.Record{
				Key:   msgData,
				Value: msgData2,
				Topic: "protobuf_serde_test_orders_123",
			},
			payloadType: PayloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.Error(t, err)
				assert.Equal(t, "failed to get message descriptor for payload: no prototype found for the given topic 'protobuf_serde_test_orders_123'. Check your configured protobuf mappings", err.Error())
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

func TestProtobufSerde_SerializeObject(t *testing.T) {
	logger, err := zap.NewProduction()
	require.NoError(t, err)

	testProtoSvc, err := protoPkg.NewService(config.Proto{
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
	}, logger, nil)
	require.NoError(t, err)

	err = testProtoSvc.Start()
	require.NoError(t, err)

	t.Run("v2proto", func(t *testing.T) {
		orderCreatedAt := time.Date(2023, time.June, 10, 13, 0, 0, 0, time.UTC)
		msg := &shopv1.Order{
			Id:        "111",
			CreatedAt: timestamppb.New(orderCreatedAt),
		}

		// serde
		serde := ProtobufSerde{}

		actualData, err := serde.SerializeObject(msg, PayloadTypeValue)
		assert.NoError(t, err)

		expectData, err := proto.Marshal(msg)
		require.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("dynamic", func(t *testing.T) {
		imports := []string{"testdata/proto/shop/v1"}
		protoPath := "order.proto"

		p := &protoparse.Parser{ImportPaths: imports}
		fds, err := p.ParseFiles(protoPath)
		require.NoError(t, err)

		typeName := "shop.v1.Order"
		var md *desc.MessageDescriptor
		for _, fd := range fds {
			for _, mt := range fd.GetMessageTypes() {
				if mt.GetFullyQualifiedName() == typeName {
					md = mt
					break
				}
			}

			if md != nil {
				break
			}
		}

		require.NotNil(t, md)

		msg := dynamic.NewMessage(md)
		err = msg.UnmarshalJSON([]byte(`{"id":"222"}`))
		require.NoError(t, err)
		assert.Equal(t, "222", msg.GetFieldByName("id").(string))

		expectData, err := msg.Marshal()
		require.NoError(t, err)

		serde := ProtobufSerde{}

		actualData, err := serde.SerializeObject(msg, PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("map type", func(t *testing.T) {
		t.Run("valid", func(t *testing.T) {
			msg := &shopv1.Order{
				Id: "333",
			}

			expectData, err := proto.Marshal(msg)
			require.NoError(t, err)

			data := map[string]interface{}{
				"id": "333",
			}

			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			actualData, err := serde.SerializeObject(data, PayloadTypeValue, WithTopic("protobuf_serde_test_orders"))
			assert.NoError(t, err)

			assert.Equal(t, expectData, actualData)
		})

		t.Run("map type missing topic", func(t *testing.T) {
			data := map[string]interface{}{
				"id": "333",
			}

			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			actualData, err := serde.SerializeObject(data, PayloadTypeValue)
			assert.Error(t, err)
			assert.Equal(t, "no topic specified", err.Error())
			assert.Nil(t, actualData)
		})

		t.Run("map type topic not found", func(t *testing.T) {
			data := map[string]interface{}{
				"id": "333",
			}

			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			actualData, err := serde.SerializeObject(data, PayloadTypeValue, WithTopic("protobuf_serde_test_orders_asdf_xyz_0123"))
			assert.Error(t, err)
			assert.Equal(t, "failed to serialize dynamic protobuf payload: no prototype found for the given topic 'protobuf_serde_test_orders_asdf_xyz_0123'. Check your configured protobuf mappings", err.Error())
			assert.Nil(t, actualData)
		})
	})

	t.Run("json string", func(t *testing.T) {
		t.Run("valid", func(t *testing.T) {
			msg := &shopv1.Order{
				Id: "543",
			}

			expectData, err := proto.Marshal(msg)
			require.NoError(t, err)

			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			data := `{"id":"543"}`
			actualData, err := serde.SerializeObject(data, PayloadTypeValue, WithTopic("protobuf_serde_test_orders"))
			assert.NoError(t, err)

			assert.Equal(t, expectData, actualData)
		})

		t.Run("missing topic", func(t *testing.T) {
			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			data := `{"id":"543"}`
			actualData, err := serde.SerializeObject(data, PayloadTypeValue)
			assert.Error(t, err)
			assert.Equal(t, "no topic specified", err.Error())
			assert.Nil(t, actualData)
		})

		t.Run("topic not found", func(t *testing.T) {
			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			data := `{"id":"543"}`
			actualData, err := serde.SerializeObject(data, PayloadTypeValue, WithTopic("protobuf_serde_test_orders_asdf_xyz_0123"))
			assert.Error(t, err)
			assert.Equal(t, "failed to serialize string protobuf payload: no prototype found for the given topic 'protobuf_serde_test_orders_asdf_xyz_0123'. Check your configured protobuf mappings", err.Error())
			assert.Nil(t, actualData)
		})

		t.Run("invalid input", func(t *testing.T) {
			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			data := `notjson`
			actualData, err := serde.SerializeObject(data, PayloadTypeValue, WithTopic("protobuf_serde_test_orders"))
			assert.Error(t, err)
			assert.Equal(t, "first byte indicates this it not valid JSON, expected brackets", err.Error())
			assert.Nil(t, actualData)
		})
	})

	t.Run("byte as json", func(t *testing.T) {
		t.Run("valid", func(t *testing.T) {
			msg := &shopv1.Order{
				Id: "555",
			}

			expectData, err := proto.Marshal(msg)
			require.NoError(t, err)

			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			data := []byte(`{"id":"555"}`)
			actualData, err := serde.SerializeObject(data, PayloadTypeValue, WithTopic("protobuf_serde_test_orders"))
			assert.NoError(t, err)

			assert.Equal(t, expectData, actualData)
		})

		t.Run("missing topic", func(t *testing.T) {
			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			data := []byte(`{"id":"543"}`)
			actualData, err := serde.SerializeObject(data, PayloadTypeValue)
			assert.Error(t, err)
			assert.Equal(t, "no topic specified", err.Error())
			assert.Nil(t, actualData)
		})

		t.Run("topic not found", func(t *testing.T) {
			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			data := []byte(`{"id":"543"}`)
			actualData, err := serde.SerializeObject(data, PayloadTypeValue, WithTopic("protobuf_serde_test_orders_asdf_xyz_0123"))
			assert.Error(t, err)
			assert.Equal(t, "failed to serialize json protobuf payload: no prototype found for the given topic 'protobuf_serde_test_orders_asdf_xyz_0123'. Check your configured protobuf mappings", err.Error())
			assert.Nil(t, actualData)
		})
	})

	t.Run("byte", func(t *testing.T) {
		t.Run("valid", func(t *testing.T) {
			msg := &shopv1.Order{
				Id: "567",
			}

			expectData, err := proto.Marshal(msg)
			require.NoError(t, err)

			serde := ProtobufSerde{ProtoSvc: testProtoSvc}

			data, err := proto.Marshal(msg)
			require.NoError(t, err)

			actualData, err := serde.SerializeObject(data, PayloadTypeValue)
			assert.NoError(t, err)

			assert.Equal(t, expectData, actualData)
		})
	})
}
