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
