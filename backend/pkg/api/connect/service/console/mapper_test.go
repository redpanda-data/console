// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"testing"

	"github.com/stretchr/testify/assert"

	v1alpha "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/serde"
)

func TestToProtoEncoding(t *testing.T) {
	tests := []struct {
		name          string
		serdeEncoding serde.PayloadEncoding
		expectedProto v1alpha.PayloadEncoding
	}{
		{
			name:          "ProtobufBSR encoding",
			serdeEncoding: serde.PayloadEncodingProtobufBSR,
			expectedProto: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF_BSR,
		},
		{
			name:          "Protobuf encoding",
			serdeEncoding: serde.PayloadEncodingProtobuf,
			expectedProto: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF,
		},
		{
			name:          "ProtobufSchema encoding",
			serdeEncoding: serde.PayloadEncodingProtobufSchema,
			expectedProto: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF_SCHEMA,
		},
		{
			name:          "JSON encoding",
			serdeEncoding: serde.PayloadEncodingJSON,
			expectedProto: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON,
		},
		{
			name:          "JSONSchema encoding",
			serdeEncoding: serde.PayloadEncodingJSONSchema,
			expectedProto: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON_SCHEMA,
		},
		{
			name:          "Avro encoding",
			serdeEncoding: serde.PayloadEncodingAvro,
			expectedProto: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_AVRO,
		},
		{
			name:          "Binary encoding",
			serdeEncoding: serde.PayloadEncodingBinary,
			expectedProto: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_BINARY,
		},
		{
			name:          "Cbor encoding",
			serdeEncoding: serde.PayloadEncodingCbor,
			expectedProto: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_CBOR,
		},
		{
			name:          "Null encoding",
			serdeEncoding: serde.PayloadEncodingNull,
			expectedProto: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_NULL,
		},
		{
			name:          "Unspecified encoding",
			serdeEncoding: serde.PayloadEncodingUnspecified,
			expectedProto: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UNSPECIFIED,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := toProtoEncoding(tt.serdeEncoding)
			assert.Equal(t, tt.expectedProto, result)
		})
	}
}

func TestFromProtoEncoding(t *testing.T) {
	tests := []struct {
		name          string
		protoEncoding v1alpha.PayloadEncoding
		expectedSerde serde.PayloadEncoding
	}{
		{
			name:          "ProtobufBSR encoding",
			protoEncoding: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF_BSR,
			expectedSerde: serde.PayloadEncodingProtobufBSR,
		},
		{
			name:          "Protobuf encoding",
			protoEncoding: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF,
			expectedSerde: serde.PayloadEncodingProtobuf,
		},
		{
			name:          "ProtobufSchema encoding",
			protoEncoding: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF_SCHEMA,
			expectedSerde: serde.PayloadEncodingProtobufSchema,
		},
		{
			name:          "JSON encoding",
			protoEncoding: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON,
			expectedSerde: serde.PayloadEncodingJSON,
		},
		{
			name:          "JSONSchema encoding",
			protoEncoding: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON_SCHEMA,
			expectedSerde: serde.PayloadEncodingJSONSchema,
		},
		{
			name:          "Avro encoding",
			protoEncoding: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_AVRO,
			expectedSerde: serde.PayloadEncodingAvro,
		},
		{
			name:          "Binary encoding",
			protoEncoding: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_BINARY,
			expectedSerde: serde.PayloadEncodingBinary,
		},
		{
			name:          "Cbor encoding",
			protoEncoding: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_CBOR,
			expectedSerde: serde.PayloadEncodingCbor,
		},
		{
			name:          "Null encoding",
			protoEncoding: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_NULL,
			expectedSerde: serde.PayloadEncodingNull,
		},
		{
			name:          "Unspecified encoding",
			protoEncoding: v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UNSPECIFIED,
			expectedSerde: serde.PayloadEncodingUnspecified,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := fromProtoEncoding(tt.protoEncoding)
			assert.Equal(t, tt.expectedSerde, result)
		})
	}
}

func TestEncodingRoundTrip(t *testing.T) {
	// Test that converting from serde -> proto -> serde yields the same result
	encodings := []serde.PayloadEncoding{
		serde.PayloadEncodingProtobufBSR,
		serde.PayloadEncodingProtobuf,
		serde.PayloadEncodingProtobufSchema,
		serde.PayloadEncodingJSON,
		serde.PayloadEncodingJSONSchema,
		serde.PayloadEncodingAvro,
		serde.PayloadEncodingBinary,
		serde.PayloadEncodingCbor,
		serde.PayloadEncodingNull,
		serde.PayloadEncodingUnspecified,
	}

	for _, encoding := range encodings {
		t.Run(string(encoding), func(t *testing.T) {
			proto := toProtoEncoding(encoding)
			result := fromProtoEncoding(proto)
			assert.Equal(t, encoding, result, "Round trip conversion should preserve encoding")
		})
	}
}

func TestToProtoRecordPayload(t *testing.T) {
	schemaID := uint32(7)

	tests := []struct {
		name       string
		payload    *serde.RecordPayload
		validateFn func(t *testing.T, got *v1alpha.KafkaRecordPayload)
	}{
		{
			name: "payload without a schema",
			payload: &serde.RecordPayload{
				Encoding:          serde.PayloadEncodingText,
				NormalizedPayload: []byte("hello"),
				PayloadSizeBytes:  5,
			},
			validateFn: func(t *testing.T, got *v1alpha.KafkaRecordPayload) {
				assert.Equal(t, v1alpha.PayloadEncoding_PAYLOAD_ENCODING_TEXT, got.GetEncoding())
				assert.Equal(t, []byte("hello"), got.GetNormalizedPayload())
				assert.EqualValues(t, 5, got.GetPayloadSize())
				assert.Nil(t, got.SchemaId)
				assert.Nil(t, got.SchemaGuid)
				assert.Empty(t, got.GetSchemaContext())
				assert.Equal(t, v1alpha.SchemaIdLocation_SCHEMA_ID_LOCATION_UNSPECIFIED, got.GetSchemaIdLocation())
				assert.NotNil(t, got.TroubleshootReport)
				assert.Empty(t, got.TroubleshootReport)
			},
		},
		{
			name: "schema ID in the payload",
			payload: &serde.RecordPayload{
				Encoding:         serde.PayloadEncodingAvro,
				SchemaID:         &schemaID,
				SchemaIDLocation: serde.SchemaIDLocationPayload,
			},
			validateFn: func(t *testing.T, got *v1alpha.KafkaRecordPayload) {
				assert.EqualValues(t, 7, got.GetSchemaId())
				assert.Nil(t, got.SchemaGuid)
				assert.Empty(t, got.GetSchemaContext())
				assert.Equal(t, v1alpha.SchemaIdLocation_SCHEMA_ID_LOCATION_PAYLOAD, got.GetSchemaIdLocation())
			},
		},
		{
			name: "schema GUID in a header, resolved in a named context",
			payload: &serde.RecordPayload{
				Encoding:         serde.PayloadEncodingProtobuf,
				SchemaID:         &schemaID,
				SchemaGUID:       "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
				SchemaContext:    ".prod",
				SchemaIDLocation: serde.SchemaIDLocationHeader,
			},
			validateFn: func(t *testing.T, got *v1alpha.KafkaRecordPayload) {
				assert.EqualValues(t, 7, got.GetSchemaId())
				assert.Equal(t, "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9", got.GetSchemaGuid())
				assert.Equal(t, ".prod", got.GetSchemaContext())
				assert.Equal(t, v1alpha.SchemaIdLocation_SCHEMA_ID_LOCATION_HEADER, got.GetSchemaIdLocation())
			},
		},
		{
			name: "troubleshooting reports",
			payload: &serde.RecordPayload{
				Encoding: serde.PayloadEncodingBinary,
				Troubleshooting: []serde.TroubleshootingReport{
					{SerdeName: "avro", Message: "schema GUID x not found"},
				},
			},
			validateFn: func(t *testing.T, got *v1alpha.KafkaRecordPayload) {
				if assert.Len(t, got.GetTroubleshootReport(), 1) {
					assert.Equal(t, "avro", got.GetTroubleshootReport()[0].GetSerdeName())
					assert.Equal(t, "schema GUID x not found", got.GetTroubleshootReport()[0].GetMessage())
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tc.validateFn(t, toProtoRecordPayload(tc.payload))
		})
	}
}
