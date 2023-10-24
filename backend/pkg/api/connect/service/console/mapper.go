// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"github.com/twmb/franz-go/pkg/kgo"

	v1alpha "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/serde"
)

func rpcPublishMessagePayloadOptionsToSerializeInput(po *v1alpha.PublishMessagePayloadOptions) *serde.RecordPayloadInput {
	encoding := serde.PayloadEncodingBinary

	switch po.GetEncoding() {
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_NONE:
		encoding = serde.PayloadEncodingNone
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_AVRO:
		encoding = serde.PayloadEncodingAvro
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF:
		encoding = serde.PayloadEncodingProtobuf
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF_SCHEMA:
		encoding = serde.PayloadEncodingProtobufSchema
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON:
		encoding = serde.PayloadEncodingJSON
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON_SCHEMA:
		encoding = serde.PayloadEncodingJSONSchema
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_XML:
		encoding = serde.PayloadEncodingXML
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_TEXT:
		encoding = serde.PayloadEncodingText
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UTF8:
		encoding = serde.PayloadEncodingUtf8WithControlChars
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_MESSAGE_PACK:
		encoding = serde.PayloadEncodingMsgPack
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_SMILE:
		encoding = serde.PayloadEncodingSmile
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UINT:
		encoding = serde.PayloadEncodingUint
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UNSPECIFIED,
		v1alpha.PayloadEncoding_PAYLOAD_ENCODING_BINARY,
		v1alpha.PayloadEncoding_PAYLOAD_ENCODING_CONSUMER_OFFSETS:
		encoding = serde.PayloadEncodingBinary
	}

	input := &serde.RecordPayloadInput{
		Payload:  po.GetData(),
		Encoding: encoding,
	}

	if po.GetSchemaId() > 0 {
		input.Options = []serde.SerdeOpt{serde.WithSchemaID(uint32(po.GetSchemaId()))}
	}

	if po.GetIndex() > 0 {
		input.Options = append(input.Options, serde.WithIndex(int(po.GetIndex())))
	}

	return input
}

func rpcCompressionTypeToKgoCodec(compressionType v1alpha.CompressionType) []kgo.CompressionCodec {
	switch compressionType {
	case v1alpha.CompressionType_COMPRESSION_TYPE_UNCOMPRESSED, v1alpha.CompressionType_COMPRESSION_TYPE_UNSPECIFIED:
		return []kgo.CompressionCodec{kgo.NoCompression()}
	case v1alpha.CompressionType_COMPRESSION_TYPE_GZIP:
		return []kgo.CompressionCodec{kgo.GzipCompression(), kgo.NoCompression()}
	case v1alpha.CompressionType_COMPRESSION_TYPE_SNAPPY:
		return []kgo.CompressionCodec{kgo.SnappyCompression(), kgo.NoCompression()}
	case v1alpha.CompressionType_COMPRESSION_TYPE_LZ4:
		return []kgo.CompressionCodec{kgo.Lz4Compression(), kgo.NoCompression()}
	case v1alpha.CompressionType_COMPRESSION_TYPE_ZSTD:
		return []kgo.CompressionCodec{kgo.ZstdCompression(), kgo.NoCompression()}
	default:
		return []kgo.CompressionCodec{kgo.NoCompression()}
	}
}

func toProtoEncoding(serdeEncoding serde.PayloadEncoding) v1alpha.PayloadEncoding {
	encoding := v1alpha.PayloadEncoding_PAYLOAD_ENCODING_BINARY

	switch serdeEncoding {
	case serde.PayloadEncodingNone:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_NONE
	case serde.PayloadEncodingAvro:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_AVRO
	case serde.PayloadEncodingProtobuf:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF
	case serde.PayloadEncodingProtobufSchema:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF_SCHEMA
	case serde.PayloadEncodingJSON:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON
	case serde.PayloadEncodingJSONSchema:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON_SCHEMA
	case serde.PayloadEncodingXML:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_XML
	case serde.PayloadEncodingText:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_TEXT
	case serde.PayloadEncodingUtf8WithControlChars:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UTF8
	case serde.PayloadEncodingMsgPack:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_MESSAGE_PACK
	case serde.PayloadEncodingSmile:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_SMILE
	case serde.PayloadEncodingUint:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UINT
	case serde.PayloadEncodingBinary:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_BINARY
	case serde.PayloadEncodingConsumerOffsets:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_CONSUMER_OFFSETS
	case serde.PayloadEncodingUnspecified:
		encoding = v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UNSPECIFIED
	}

	return encoding
}

func fromProtoEncoding(protoEncoding v1alpha.PayloadEncoding) serde.PayloadEncoding {
	encoding := serde.PayloadEncodingUnspecified

	switch protoEncoding {
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_NONE:
		encoding = serde.PayloadEncodingNone
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_AVRO:
		encoding = serde.PayloadEncodingAvro
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF:
		encoding = serde.PayloadEncodingProtobuf
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_PROTOBUF_SCHEMA:
		encoding = serde.PayloadEncodingProtobufSchema
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON:
		encoding = serde.PayloadEncodingJSON
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_JSON_SCHEMA:
		encoding = serde.PayloadEncodingJSONSchema
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_XML:
		encoding = serde.PayloadEncodingXML
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_TEXT:
		encoding = serde.PayloadEncodingText
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UTF8:
		encoding = serde.PayloadEncodingUtf8WithControlChars
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_MESSAGE_PACK:
		encoding = serde.PayloadEncodingMsgPack
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_SMILE:
		encoding = serde.PayloadEncodingSmile
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UINT:
		encoding = serde.PayloadEncodingUint
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_BINARY:
		encoding = serde.PayloadEncodingBinary
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_CONSUMER_OFFSETS:
		encoding = serde.PayloadEncodingConsumerOffsets
	case v1alpha.PayloadEncoding_PAYLOAD_ENCODING_UNSPECIFIED:
		encoding = serde.PayloadEncodingUnspecified
	}

	return encoding
}
