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
	"bytes"
	"context"
	"errors"
	"fmt"
	"unicode/utf8"

	"github.com/twmb/franz-go/pkg/kgo"
)

var _ Serde = (*TextSerde)(nil)

// TextSerde represents the serde for dealing with text types.
type TextSerde struct{}

// Name returns the name of the serde payload encoding.
func (TextSerde) Name() PayloadEncoding {
	return PayloadEncodingText
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (TextSerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	trimmed := bytes.TrimLeft(payload, " \t\r\n")

	if len(trimmed) == 0 {
		return &RecordPayload{
			NormalizedPayload:   payload,
			DeserializedPayload: string(payload),
			Encoding:            PayloadEncodingText,
		}, nil
	}

	isUTF8 := utf8.Valid(payload)
	if !isUTF8 {
		return &RecordPayload{}, errors.New("payload is not UTF8")
	}

	if containsControlChars(payload) {
		return &RecordPayload{}, errors.New("payload contains UTF8 control characters therefore not plain text format")
	}

	return &RecordPayload{
		NormalizedPayload:   payload,
		DeserializedPayload: string(payload),
		Encoding:            PayloadEncodingText,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (TextSerde) SerializeObject(_ context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	var byteData []byte
	switch v := obj.(type) {
	case string:
		byteData = []byte(v)
	case []byte:
		byteData = v
	default:
		return nil, fmt.Errorf("unsupported type %+T for text serialization", obj)
	}

	isUTF8 := utf8.Valid(byteData)
	if !isUTF8 {
		return nil, errors.New("payload is not UTF8")
	}

	// If message encoding text is used and the byte array is empty, the user
	// probably wants to write an empty string, rather than null.
	if byteData == nil {
		byteData = []byte("")
	}

	return byteData, nil
}
