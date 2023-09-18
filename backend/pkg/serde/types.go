// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package serde

type PayloadEncoding string

const (
	PayloadEncodingNone                 PayloadEncoding = "none"
	PayloadEncodingAvro                 PayloadEncoding = "avro"
	PayloadEncodingProtobuf             PayloadEncoding = "protobuf"
	PayloadEncodingJSON                 PayloadEncoding = "json"
	PayloadEncodingXML                  PayloadEncoding = "xml"
	PayloadEncodingText                 PayloadEncoding = "text"
	PayloadEncodingUtf8WithControlChars PayloadEncoding = "utf8WithControlChars"
	PayloadEncodingConsumerOffsets      PayloadEncoding = "consumerOffsets"
	PayloadEncodingBinary               PayloadEncoding = "binary"
	PayloadEncodingMsgPack              PayloadEncoding = "msgpack"
	PayloadEncodingSmile                PayloadEncoding = "smile"
	PayloadEncodingUint                 PayloadEncoding = "uint"
)

type HeaderEncoding string

const (
	HeaderEncodingNone   HeaderEncoding = "none"
	HeaderEncodingUTF8   HeaderEncoding = "text"
	HeaderEncodingBinary HeaderEncoding = "binary"
)

// PayloadType indicates whether we want to deserialize the Key or Value of a given Record.
type PayloadType int

const (
	PayloadTypeKey PayloadType = iota
	PayloadTypeValue
)

// UintSize is the size of uint to be used in uint serialization.
type UintSize uint

const (
	Uint8 UintSize = iota
	Uint16
	Uint32
	Uint64
)
