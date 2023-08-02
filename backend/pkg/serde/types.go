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
	payloadEncodingNone                 PayloadEncoding = "none"
	payloadEncodingAvro                 PayloadEncoding = "avro"
	payloadEncodingProtobuf             PayloadEncoding = "protobuf"
	payloadEncodingJSON                 PayloadEncoding = "json"
	payloadEncodingXML                  PayloadEncoding = "xml"
	payloadEncodingText                 PayloadEncoding = "text"
	payloadEncodingUtf8WithControlChars PayloadEncoding = "utf8WithControlChars"
	payloadEncodingConsumerOffsets      PayloadEncoding = "consumerOffsets"
	payloadEncodingBinary               PayloadEncoding = "binary"
	payloadEncodingMsgP                 PayloadEncoding = "msgpack"
	payloadEncodingSmile                PayloadEncoding = "smile"
)

type headerEncoding string

const (
	headerEncodingNone   headerEncoding = "none"
	headerEncodingUTF8   headerEncoding = "text"
	headerEncodingBinary headerEncoding = "binary"
)

// payloadType indicates whether we want to deserialize the Key or Value of a given Record.
type payloadType int

const (
	payloadTypeKey payloadType = iota
	payloadTypeValue
)
