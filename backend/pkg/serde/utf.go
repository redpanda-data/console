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
	"encoding/base64"
	"errors"
	"fmt"
	"unicode/utf8"

	"github.com/twmb/franz-go/pkg/kgo"
)

var _ Serde = (*UTF8Serde)(nil)

// UTF8Serde represents the serde for dealing with UTF8 text types.
type UTF8Serde struct{}

// Name returns the name of the serde payload encoding.
func (UTF8Serde) Name() PayloadEncoding {
	return PayloadEncodingUtf8WithControlChars
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (UTF8Serde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)
	trimmed := bytes.TrimLeft(payload, " \t\r\n")

	if len(trimmed) == 0 {
		return &RecordPayload{}, errors.New("after trimming whitespaces there were no characters left")
	}

	isUTF8 := utf8.Valid(payload)
	if !isUTF8 {
		return &RecordPayload{}, errors.New("payload is not UTF8")
	}

	if !containsControlChars(payload) {
		return &RecordPayload{}, errors.New("payload does not contain UTF8 control characters")
	}

	return &RecordPayload{
		NormalizedPayload:   payload,
		DeserializedPayload: payload,
		Encoding:            PayloadEncodingUtf8WithControlChars,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (UTF8Serde) SerializeObject(_ context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	var byteData []byte
	switch v := obj.(type) {
	case string:
		decoded, err := base64.StdEncoding.DecodeString(v)
		if err == nil {
			v = string(decoded)
		}
		byteData = []byte(v)
	case []byte:
		byteData = v
	default:
		return nil, fmt.Errorf("unsupported type %+T for text serialization", obj)
	}

	trimmed := bytes.TrimLeft(byteData, " \t\r\n")

	if len(trimmed) == 0 {
		return nil, errors.New("after trimming whitespaces there were no characters left")
	}

	isUTF8 := utf8.Valid(byteData)
	if !isUTF8 {
		return nil, errors.New("payload is not UTF8")
	}

	if !containsControlChars(byteData) {
		return nil, errors.New("payload does not contain UTF8 control characters")
	}

	return byteData, nil
}

func containsControlChars(b []byte) bool {
	for _, v := range b {
		if (v <= 31) || (v >= 127 && v <= 159) {
			return true
		}
	}
	return false
}
