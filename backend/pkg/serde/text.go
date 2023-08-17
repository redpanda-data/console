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
	"fmt"
	"unicode/utf8"

	"github.com/twmb/franz-go/pkg/kgo"
)

var _ Serde = (*TextSerde)(nil)

type TextSerde struct{}

func (TextSerde) Name() PayloadEncoding {
	return PayloadEncodingText
}

func (TextSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	trimmed := bytes.TrimLeft(payload, " \t\r\n")

	if len(trimmed) == 0 {
		return RecordPayload{
			NormalizedPayload:   payload,
			DeserializedPayload: payload,
			Encoding:            PayloadEncodingText,
		}, nil
	}

	isUTF8 := utf8.Valid(payload)
	if !isUTF8 {
		return RecordPayload{}, fmt.Errorf("payload is not UTF8")
	}

	if containsControlChars(payload) {
		return RecordPayload{}, fmt.Errorf("payload contains UTF8 control characters therefore not plain text format")
	}

	return RecordPayload{
		NormalizedPayload:   payload,
		DeserializedPayload: payload,
		Encoding:            PayloadEncodingText,
	}, nil
}
