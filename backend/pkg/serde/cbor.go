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
	"strings"

	"github.com/fxamacker/cbor/v2"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/config"
)

var _ Serde = (*CborSerde)(nil)

// CborSerde represents the serde for dealing with CBOR types.
type CborSerde struct {
	Config config.Cbor
}

// Name returns the name of the serde payload encoding.
func (CborSerde) Name() PayloadEncoding {
	return PayloadEncodingCbor
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (d CborSerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	if !d.isTopicAllowed(record.Topic) {
		return &RecordPayload{}, fmt.Errorf("cbor encoding not configured for topic: %s", record.Topic)
	}

	payload := payloadFromRecord(record, payloadType)

	if len(payload) == 0 {
		return &RecordPayload{}, fmt.Errorf("payload is empty")
	}

	var obj any
	err := cbor.Unmarshal(payload, &obj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed decoding cbor payload: %w", err)
	}

	jsonObj := cborObjToJSON(obj)
	jsonBytes, err := json.Marshal(jsonObj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("failed converting cbor decoded object to JSON: %w", err)
	}

	return &RecordPayload{
		NormalizedPayload:   jsonBytes,
		DeserializedPayload: jsonObj,
		Encoding:            PayloadEncodingCbor,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (CborSerde) SerializeObject(_ context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	var binData []byte
	switch v := obj.(type) {
	case string:
		trimmed := strings.TrimLeft(v, " \t\r\n")

		if trimmed == "" {
			return nil, errors.New("string payload is empty")
		}

		startsWithJSON := trimmed[0] == '[' || trimmed[0] == '{'
		if !startsWithJSON {
			return nil, fmt.Errorf("first byte indicates this it not valid JSON, expected brackets")
		}

		var nativeObj any
		err := json.Unmarshal([]byte(trimmed), &nativeObj)
		if err != nil {
			return nil, fmt.Errorf("failed to deserialize json to cbor payload: %w", err)
		}

		b, err := cbor.Marshal(nativeObj)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize cbor payload: %w", err)
		}

		binData = b
	case []byte:
		trimmed := bytes.TrimLeft(v, " \t\r\n")
		if len(trimmed) != 0 && trimmed[0] == '[' || trimmed[0] == '{' {
			var nativeObj any
			err := json.Unmarshal(trimmed, &nativeObj)
			if err != nil {
				return nil, fmt.Errorf("failed to deserialize json to cbor payload: %w", err)
			}

			b, err := cbor.Marshal(nativeObj)
			if err != nil {
				return nil, fmt.Errorf("failed to serialize cbor payload: %w", err)
			}

			binData = b
		} else {
			binData = v
		}
	default:
		b, err := cbor.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize cbor payload: %w", err)
		}

		binData = b
	}

	return binData, nil
}

func (d CborSerde) isTopicAllowed(topic string) bool {
	if !d.Config.Enabled {
		return false
	}

	if d.Config.TopicName.Regexp != nil {
		return d.Config.TopicName.Regexp.MatchString(topic)
	}

	return d.Config.TopicName.String() == topic
}

func cborObjToJSON(in any) (out any) {
	switch in := in.(type) {
	case []any:
		tmp := make([]any, 0, len(in))
		for _, v := range in {
			tmp = append(tmp, cborObjToJSON(v))
		}
		out = tmp
	case map[any]any:
		tmp := make(map[string]any, len(in))
		for k, v := range in {
			tmp[fmt.Sprintf("%v", k)] = cborObjToJSON(v)
		}
		out = tmp
	default:
		out = in
	}
	return out
}
