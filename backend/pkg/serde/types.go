// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package serde

// PayloadEncoding is an enum for different payload encoding types.
type PayloadEncoding string

const (
	// PayloadEncodingUnspecified is for when encoding is not specified.
	PayloadEncodingUnspecified PayloadEncoding = "unspecified"
	// PayloadEncodingNone is the enum of none types.
	PayloadEncodingNone PayloadEncoding = "none"
	// PayloadEncodingAvro is the enum of Avro encoded types.
	PayloadEncodingAvro PayloadEncoding = "avro"
	// PayloadEncodingProtobuf is the enum of protobuf encoded types.
	PayloadEncodingProtobuf PayloadEncoding = "protobuf"
	// PayloadEncodingProtobufSchema is the enum of protobuf encoded types using schema registry.
	PayloadEncodingProtobufSchema PayloadEncoding = "protobufSchema"
	// PayloadEncodingJSON is the enum of JSON encoded types.
	PayloadEncodingJSON PayloadEncoding = "json"
	// PayloadEncodingJSONSchema is the enum of JSON encoded types using schema registry.
	PayloadEncodingJSONSchema PayloadEncoding = "jsonSchema"
	// PayloadEncodingXML is the enum of XML encoded types.
	PayloadEncodingXML PayloadEncoding = "xml"
	// PayloadEncodingText is the enum of text types.
	PayloadEncodingText PayloadEncoding = "text"
	// PayloadEncodingUtf8WithControlChars is the enum of UTF8 with control character types.
	PayloadEncodingUtf8WithControlChars PayloadEncoding = "utf8WithControlChars"
	// PayloadEncodingConsumerOffsets is the enum of consumer offset types.
	PayloadEncodingConsumerOffsets PayloadEncoding = "consumerOffsets"
	// PayloadEncodingBinary is the enum of binary encoded types.
	PayloadEncodingBinary PayloadEncoding = "binary"
	// PayloadEncodingMsgPack is the enum of MessagePack types.
	PayloadEncodingMsgPack PayloadEncoding = "msgpack"
	// PayloadEncodingSmile is the enum of smile types.
	PayloadEncodingSmile PayloadEncoding = "smile"
	// PayloadEncodingUint is the enum of Uint types.
	PayloadEncodingUint PayloadEncoding = "uint"
)

// HeaderEncoding is an enum for different header encoding types.
type HeaderEncoding string

const (
	// HeaderEncodingNone is the none encoding for a header.
	HeaderEncodingNone HeaderEncoding = "none"
	// HeaderEncodingUTF8 is the text encoding for a header.
	HeaderEncodingUTF8 HeaderEncoding = "text"
	// HeaderEncodingBinary is the binary encoding for a header.
	HeaderEncodingBinary HeaderEncoding = "binary"
)

// PayloadType indicates whether we want to deserialize the Key or Value of a given Record.
type PayloadType int

const (
	// PayloadTypeKey is the key payload.
	PayloadTypeKey PayloadType = iota
	// PayloadTypeValue is the value payload.
	PayloadTypeValue
)

// UintSize is the size of uint to be used in uint serialization.
type UintSize uint

const (
	// Uint8 is the uint of size of 8 bits.
	Uint8 UintSize = iota
	// Uint16 is the uint of size of 18 bits.
	Uint16
	// Uint32 is the uint of size of 32 bits.
	Uint32
	// Uint64 is the uint of size of 64 bits.
	Uint64
)
