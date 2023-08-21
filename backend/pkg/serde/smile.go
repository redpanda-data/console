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
	"encoding/json"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/zencoder/go-smile/smile"
)

var _ Serde = (*SmileSerde)(nil)

type SmileSerde struct{}

func (SmileSerde) Name() PayloadEncoding {
	return PayloadEncodingSmile
}

func (SmileSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)
	trimmed := bytes.TrimLeft(payload, " \t\r\n")

	if len(trimmed) == 0 {
		return RecordPayload{}, fmt.Errorf("after trimming whitespaces there were no characters left")
	}

	startsWithSmile := len(payload) > 3 && payload[0] == ':' && payload[1] == ')' && payload[2] == '\n'
	if !startsWithSmile {
		return RecordPayload{}, fmt.Errorf("first bytes indicate this it not valid Smile format")
	}

	obj, err := smile.DecodeToObject(payload)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("failed to decode Smile payload: %w", err)
	}

	jsonBytes, err := json.Marshal(obj)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("failed to serialize Smile payload to json: %w", err)
	}

	return RecordPayload{
		DeserializedPayload: obj,
		NormalizedPayload:   jsonBytes,
		Encoding:            PayloadEncodingSmile,
	}, nil
}

func (SmileSerde) SerializeObject(obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error) {
	return nil, errors.New("not implemented")
}
