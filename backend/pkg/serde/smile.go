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

// SmileSerde represents the serde for dealing with Smile types.
type SmileSerde struct{}

// Name returns the name of the serde payload encoding.
func (SmileSerde) Name() PayloadEncoding {
	return PayloadEncodingSmile
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (SmileSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)
	trimmed := bytes.TrimLeft(payload, " \t\r\n")

	if len(trimmed) == 0 {
		return &RecordPayload{}, fmt.Errorf("after trimming whitespaces there were no characters left")
	}

	startsWithSmile := len(payload) > 3 && payload[0] == ':' && payload[1] == ')' && payload[2] == '\n'
	if !startsWithSmile {
		return &RecordPayload{}, fmt.Errorf("first bytes indicate this it not valid Smile format")
	}

	obj, err := smile.DecodeToObject(payload)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to decode Smile payload: %w", err)
	}

	jsonBytes, err := json.Marshal(obj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed to serialize Smile payload to json: %w", err)
	}

	return &RecordPayload{
		DeserializedPayload: obj,
		NormalizedPayload:   jsonBytes,
		Encoding:            PayloadEncodingSmile,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
// This is not supported for this type for now.
func (SmileSerde) SerializeObject(_ any, _ PayloadType, _ ...SerdeOpt) ([]byte, error) {
	// go-smile does not support encoding yet
	// https://github.com/zencoder/go-smile
	return nil, errors.New("serializing for smile data format is not implemented")
}
