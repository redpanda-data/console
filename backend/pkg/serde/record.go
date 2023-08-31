// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package serde

// Record is parsed Kafka record that can be processed by the frontend.
type Record struct {
	Key     *RecordPayload `json:"key"`
	Value   *RecordPayload `json:"value"`
	Headers []RecordHeader `json:"headers"`
}

type RecordPayload struct {
	// OriginalPayload is the original Kafka record. This may be helpful for
	// downloading an original Kafka record. This is only set when this
	// is specifically requested.
	OriginalPayload []byte `json:"originalPayload,omitempty"`

	// PayloadSizeBytes is the size of the payload in bytes. This can not be set
	// by the custom marshaller, as we usually don't transmit the original payload
	// unless this is specifically requested.
	PayloadSizeBytes int `json:"payloadSizeBytes"`

	// NormalizedPayload is the human-readable and parsed version of the payload.
	// An avro or protobuf record will be parsed into an object that shall
	// be JSON serialized when sending to the frontend whereas binary
	// content shall be presented as a hex-encoded string. This requires
	// a custom marshaller.
	NormalizedPayload []byte `json:"humanReadablePayload"`

	// DeserializedPayload is the deserialized representation of the record payload.
	// This property will be passed to the JavaScript interpreter
	// that is used for push-down filters.
	DeserializedPayload any `json:"-"`

	// IsPayloadTooLarge will be true if the payload is too large to be processed
	// by the frontend. If this is true, all payload fields will be nil and the frontend
	// must show a message for that case. The decision whether the payload is too large
	// to be displayed is made in the MarshalJSON method, and therefore you never need
	// to set this field in a Serde.
	IsPayloadTooLarge bool `json:"isPayloadTooLarge"`

	// IsPayloadNull is set to true if the payload is nil. This is used by the frontend
	// to differentiate between empty and null payloads.
	IsPayloadNull bool `json:"isPayloadNull"`

	// Encoding is the encoding that has been recognized. Dependent on the
	// recognized encoding the ParsedPayload will be set.
	Encoding PayloadEncoding `json:"encoding"`

	// SchemaID refers to the schema id that is used in the schema registry.
	// If no schema was used for this payload, this will be nil.
	SchemaID *uint32 `json:"schemaId,omitempty"`

	// Troubleshooting provides troubleshooting information. This will always
	// be collected based on the reported errors by each serde and will be
	// sent to the requester if it has been requested.
	Troubleshooting []TroubleshootingReport `json:"troubleshooting,omitempty"`

	// ExtraMetadata are key/value pairs that can be added by the Serde.
	// They will always be shown in the frontend when provided, therefore
	// we should not return too much extra information to avoid information
	// overload in the UI.
	ExtraMetadata map[string]string `json:"extraMetadata,omitempty"`
}

// RecordHeader defines the schema for a single header that can be attached
// to a Kafka record. Each Kafka record may have none or many record headers.
type RecordHeader struct {
	// Key is the header's key. Keys do not need to be unique and may
	// appear multiple times.
	Key string `json:"key"`

	// Value is supposed to be an UTF8 string per the protocol. Technically
	// it is a byte array. Because the conversion is simple enough in the
	// frontend we'll always send the byte array as hex-encoded string.
	// The encoding that is sent alongside will inform about the encoding.
	Value []byte `json:"value"`

	// IsValueTooLarge will be true if the value's payload is too large to be processed
	// by the frontend. If this is true, all payload fields will be nil and the frontend
	// must show a message for that case. The decision whether the payload is too large
	// to be displayed is made in the MarshalJSON method, and therefore you never need
	// to set this field in a Serde.
	IsValueTooLarge bool `json:"isValueTooLarge"`

	// Encoding is the encoding that has been recognized for the value.
	Encoding HeaderEncoding `json:"encoding"`
}

// TroubleshootingReport contains troubleshooting information why a Serde has failed
// to deserialize a given Kafka record.
type TroubleshootingReport struct {
	// Serde that emitted the troubleshooting message.
	SerdeName string `json:"serdeName"`

	// Message is the string that will be shown in the frontend when
	// the user enabled troubleshooting to figure out why a record
	// has not been deserialized as anticipated.
	Message string `json:"message"`
}

type SerializeInput struct {
	Topic string
	Key   RecordPayloadInput
	Value RecordPayloadInput
}

type RecordPayloadInput struct {
	Payload  any
	Encoding PayloadEncoding
	Options  []SerdeOpt
}

type SerializeOutput struct {
	Key   *RecordPayloadSerializeResult `json:"key,omitempty"`
	Value *RecordPayloadSerializeResult `json:"value,omitempty"`
}

type RecordPayloadSerializeResult struct {
	Payload         []byte
	Encoding        PayloadEncoding         `json:"encoding"`
	Troubleshooting []TroubleshootingReport `json:"troubleshooting,omitempty"`
}
