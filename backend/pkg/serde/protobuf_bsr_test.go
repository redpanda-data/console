// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package serde

import (
	"context"
	"testing"
	"time"

	"github.com/bufbuild/protocompile/linker"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/known/timestamppb"

	shopv1 "github.com/redpanda-data/console/backend/pkg/serde/testdata/proto/gen/shop/v1"
)

// mockBSRClient implements the BSRClient interface for testing
type mockBSRClient struct {
	messageDescriptor protoreflect.MessageDescriptor
	files             linker.Files
	err               error
}

func (m *mockBSRClient) GetMessageDescriptor(_ context.Context, _, _ string) (protoreflect.MessageDescriptor, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.messageDescriptor, nil
}

func (m *mockBSRClient) GetFileDescriptorSet(_ context.Context, _, _ string) (linker.Files, error) {
	if m.err != nil {
		return linker.Files{}, m.err
	}
	return m.files, nil
}

func TestProtobufBSRSerde_Name(t *testing.T) {
	serde := ProtobufBSRSerde{}
	assert.Equal(t, PayloadEncodingProtobufBSR, serde.Name())
}

func TestProtobufBSRSerde_DeserializePayload(t *testing.T) {
	// Create test message
	orderCreatedAt := time.Date(2023, time.June, 10, 13, 0, 0, 0, time.UTC)
	msg := shopv1.Order{
		Id:        "test-order-123",
		CreatedAt: timestamppb.New(orderCreatedAt),
	}

	msgData, err := proto.Marshal(&msg)
	require.NoError(t, err)

	// Get message descriptor and files for mock
	msgDesc := msg.ProtoReflect().Descriptor()
	fileDesc := msgDesc.ParentFile()

	// Create a linker.Files from the file descriptor
	linkerFile, err := linker.NewFileRecursive(fileDesc)
	require.NoError(t, err)
	files := linker.Files{linkerFile}

	tests := []struct {
		name        string
		record      *kgo.Record
		payloadType PayloadType
		bsrClient   BSRClient
		wantErr     bool
		wantErrMsg  string
		validateRes func(t *testing.T, res *RecordPayload)
	}{
		{
			name: "successful deserialization",
			record: &kgo.Record{
				Value: msgData,
				Headers: []kgo.RecordHeader{
					{Key: "buf.registry.value.schema.message", Value: []byte("shop.v1.Order")},
					{Key: "buf.registry.value.schema.commit", Value: []byte("abc123")},
				},
			},
			payloadType: PayloadTypeValue,
			bsrClient: &mockBSRClient{
				messageDescriptor: msgDesc,
				files:             files,
			},
			wantErr: false,
			validateRes: func(t *testing.T, res *RecordPayload) {
				assert.Equal(t, PayloadEncodingProtobufBSR, res.Encoding)
				assert.NotNil(t, res.DeserializedPayload)
				assert.NotEmpty(t, res.NormalizedPayload)
				assert.Nil(t, res.SchemaID)
				assert.Equal(t, len(msgData), res.PayloadSizeBytes)

				// Validate the deserialized content
				payload, ok := res.DeserializedPayload.(map[string]any)
				require.True(t, ok, "expected payload to be a map")
				assert.Equal(t, "test-order-123", payload["id"])
			},
		},
		{
			name: "nil bsr client",
			record: &kgo.Record{
				Value: msgData,
			},
			payloadType: PayloadTypeValue,
			bsrClient:   nil,
			wantErr:     true,
			wantErrMsg:  "BSR client is not configured",
		},
		{
			name: "empty payload",
			record: &kgo.Record{
				Value: []byte{},
			},
			payloadType: PayloadTypeValue,
			bsrClient: &mockBSRClient{
				messageDescriptor: msgDesc,
				files:             files,
			},
			wantErr:    true,
			wantErrMsg: "payload is empty",
		},
		{
			name: "missing message header",
			record: &kgo.Record{
				Value: msgData,
				Headers: []kgo.RecordHeader{
					{Key: "buf.registry.value.schema.commit", Value: []byte("abc123")},
				},
			},
			payloadType: PayloadTypeValue,
			bsrClient: &mockBSRClient{
				messageDescriptor: msgDesc,
				files:             files,
			},
			wantErr:    true,
			wantErrMsg: "failed to extract message name from header",
		},
		{
			name: "missing commit header",
			record: &kgo.Record{
				Value: msgData,
				Headers: []kgo.RecordHeader{
					{Key: "buf.registry.value.schema.message", Value: []byte("shop.v1.Order")},
				},
			},
			payloadType: PayloadTypeValue,
			bsrClient: &mockBSRClient{
				messageDescriptor: msgDesc,
				files:             files,
			},
			wantErr:    true,
			wantErrMsg: "failed to extract commit from header",
		},
		{
			name: "empty message header value",
			record: &kgo.Record{
				Value: msgData,
				Headers: []kgo.RecordHeader{
					{Key: "buf.registry.value.schema.message", Value: []byte{}},
					{Key: "buf.registry.value.schema.commit", Value: []byte("abc123")},
				},
			},
			payloadType: PayloadTypeValue,
			bsrClient: &mockBSRClient{
				messageDescriptor: msgDesc,
				files:             files,
			},
			wantErr:    true,
			wantErrMsg: "header \"buf.registry.value.schema.message\" is empty",
		},
		{
			name: "invalid protobuf data",
			record: &kgo.Record{
				Value: []byte("not valid protobuf"),
				Headers: []kgo.RecordHeader{
					{Key: "buf.registry.value.schema.message", Value: []byte("shop.v1.Order")},
					{Key: "buf.registry.value.schema.commit", Value: []byte("abc123")},
				},
			},
			payloadType: PayloadTypeValue,
			bsrClient: &mockBSRClient{
				messageDescriptor: msgDesc,
				files:             files,
			},
			wantErr:    true,
			wantErrMsg: "unable to unmarshal protobuf encoded record",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			serde := ProtobufBSRSerde{
				bsrClient: tt.bsrClient,
			}

			res, err := serde.DeserializePayload(context.Background(), tt.record, tt.payloadType)

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErrMsg)
				return
			}

			require.NoError(t, err)
			if tt.validateRes != nil {
				tt.validateRes(t, res)
			}
		})
	}
}

func TestProtobufBSRSerde_SerializeObject(t *testing.T) {
	orderCreatedAt := time.Date(2023, time.June, 10, 13, 0, 0, 0, time.UTC)
	msg := &shopv1.Order{
		Id:        "test-order-456",
		CreatedAt: timestamppb.New(orderCreatedAt),
	}

	tests := []struct {
		name        string
		obj         any
		payloadType PayloadType
		wantErr     bool
		wantErrMsg  string
		validate    func(t *testing.T, data []byte)
	}{
		{
			name:        "successful serialization",
			obj:         msg,
			payloadType: PayloadTypeValue,
			wantErr:     false,
			validate: func(t *testing.T, data []byte) {
				// Verify we can unmarshal it back
				var decoded shopv1.Order
				err := proto.Unmarshal(data, &decoded)
				require.NoError(t, err)
				assert.Equal(t, "test-order-456", decoded.Id)
			},
		},
		{
			name:        "unsupported object type",
			obj:         "not a proto message",
			payloadType: PayloadTypeValue,
			wantErr:     true,
			wantErrMsg:  "unsupported object type for BSR serialization",
		},
		{
			name:        "nil object",
			obj:         nil,
			payloadType: PayloadTypeValue,
			wantErr:     true,
			wantErrMsg:  "unsupported object type for BSR serialization",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			serde := ProtobufBSRSerde{}

			data, err := serde.SerializeObject(context.Background(), tt.obj, tt.payloadType)

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErrMsg)
				return
			}

			require.NoError(t, err)
			if tt.validate != nil {
				tt.validate(t, data)
			}
		})
	}
}

func TestExtractHeader(t *testing.T) {
	tests := []struct {
		name       string
		record     *kgo.Record
		key        string
		wantValue  string
		wantErr    bool
		wantErrMsg string
	}{
		{
			name: "header exists",
			record: &kgo.Record{
				Headers: []kgo.RecordHeader{
					{Key: "test-key", Value: []byte("test-value")},
				},
			},
			key:       "test-key",
			wantValue: "test-value",
			wantErr:   false,
		},
		{
			name: "header not found",
			record: &kgo.Record{
				Headers: []kgo.RecordHeader{
					{Key: "other-key", Value: []byte("other-value")},
				},
			},
			key:        "test-key",
			wantErr:    true,
			wantErrMsg: "header \"test-key\" not found",
		},
		{
			name: "empty header value",
			record: &kgo.Record{
				Headers: []kgo.RecordHeader{
					{Key: "test-key", Value: []byte{}},
				},
			},
			key:        "test-key",
			wantErr:    true,
			wantErrMsg: "header \"test-key\" is empty",
		},
		{
			name: "multiple headers, find correct one",
			record: &kgo.Record{
				Headers: []kgo.RecordHeader{
					{Key: "header1", Value: []byte("value1")},
					{Key: "header2", Value: []byte("value2")},
					{Key: "header3", Value: []byte("value3")},
				},
			},
			key:       "header2",
			wantValue: "value2",
			wantErr:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			value, err := extractHeader(tt.record, tt.key)

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErrMsg)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantValue, value)
		})
	}
}
