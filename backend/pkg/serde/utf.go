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
	"encoding/base64"
	"encoding/json"
	"fmt"
	"unicode/utf8"

	"github.com/twmb/franz-go/pkg/kgo"
)

var _ Serde = (*UTF8Serde)(nil)

type UTF8Serde struct{}

func (UTF8Serde) Name() PayloadEncoding {
	return PayloadEncodingUtf8WithControlChars
}

func (UTF8Serde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)
	trimmed := bytes.TrimLeft(payload, " \t\r\n")

	if len(trimmed) == 0 {
		return RecordPayload{}, fmt.Errorf("after trimming whitespaces there were no characters left")
	}

	isUTF8 := utf8.Valid(payload)
	if !isUTF8 {
		return RecordPayload{}, fmt.Errorf("payload is not UTF8")
	}

	if !containsControlChars(payload) {
		return RecordPayload{}, fmt.Errorf("payload does not contain UTF8 control characters")
	}

	b64 := base64.StdEncoding.EncodeToString(payload)
	jsonBytes, err := json.Marshal(b64)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("decoding message pack payload: %w", err)
	}

	return RecordPayload{
		NormalizedPayload:   jsonBytes,
		DeserializedPayload: payload,
		Encoding:            PayloadEncodingUtf8WithControlChars,
	}, nil
}

func (UTF8Serde) SerializeObject(obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error) {
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
		return nil, fmt.Errorf("unsupported type %+T for protobuf serialization", obj)
	}

	trimmed := bytes.TrimLeft(byteData, " \t\r\n")

	if len(trimmed) == 0 {
		return nil, fmt.Errorf("after trimming whitespaces there were no characters left")
	}

	isUTF8 := utf8.Valid(byteData)
	if !isUTF8 {
		return nil, fmt.Errorf("payload is not UTF8")
	}

	if !containsControlChars(byteData) {
		return nil, fmt.Errorf("payload does not contain UTF8 control characters")
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
