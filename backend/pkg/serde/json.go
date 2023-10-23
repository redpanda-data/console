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
	"encoding/json"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
)

var _ Serde = (*JSONSerde)(nil)

// JSONSerde represents the serde for dealing with JSON types.
type JSONSerde struct{}

// Name returns the name of the serde payload encoding.
func (JSONSerde) Name() PayloadEncoding {
	return PayloadEncodingJSON
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (JSONSerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	obj, err := jsonDeserializePayload(payload)
	if err != nil {
		return &RecordPayload{}, err
	}

	return &RecordPayload{
		NormalizedPayload:   payload,
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingJSON,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (JSONSerde) SerializeObject(_ context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	if so.schemaID > 0 {
		return nil, errors.New("skipping plain json as schema id is set")
	}

	var byteData []byte
	switch v := obj.(type) {
	case string:
		byteData = []byte(v)
	case []byte:
		byteData = v
	default:
		encoded, err := json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("error serializing to JSON: %w", err)
		}
		byteData = encoded
	}

	trimmed, startsWithJSON, err := trimJSONInput(byteData)
	if err != nil {
		return nil, err
	}

	if !startsWithJSON {
		return nil, fmt.Errorf("first byte indicates this it not valid JSON, expected brackets")
	}

	return trimmed, nil
}

func jsonDeserializePayload(payload []byte) (any, error) {
	trimmed := bytes.TrimLeft(payload, " \t\r\n")

	if len(trimmed) == 0 {
		return nil, fmt.Errorf("after trimming whitespaces there were no characters left")
	}

	startsWithJSON := trimmed[0] == '[' || trimmed[0] == '{'
	if !startsWithJSON {
		return nil, fmt.Errorf("first byte indicates this it not valid JSON, expected brackets")
	}

	var obj any
	err := json.Unmarshal(payload, &obj)
	if err != nil {
		return nil, fmt.Errorf("failed to parse JSON payload: %w", err)
	}

	return obj, nil
}
