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

	"github.com/twmb/franz-go/pkg/kgo"
	mp "github.com/vmihailenco/msgpack/v5"

	"github.com/redpanda-data/console/backend/pkg/msgpack"
)

var _ Serde = (*MsgPackSerde)(nil)

// MsgPackSerde represents the serde for dealing with MessagePack types.
type MsgPackSerde struct {
	MsgPackService *msgpack.Service
}

// Name returns the name of the serde payload encoding.
func (MsgPackSerde) Name() PayloadEncoding {
	return PayloadEncodingMsgPack
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (d MsgPackSerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	if d.MsgPackService == nil {
		return &RecordPayload{}, errors.New("no message pack service configured")
	}

	if !d.MsgPackService.IsTopicAllowed(record.Topic) {
		return &RecordPayload{}, fmt.Errorf("message pack encoding not configured for topic: %s", record.Topic)
	}

	payload := payloadFromRecord(record, payloadType)

	var obj any
	err := mp.Unmarshal(payload, &obj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("decoding message pack payload: %w", err)
	}

	jsonBytes, err := json.Marshal(obj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("decoding message pack payload: %w", err)
	}

	return &RecordPayload{
		NormalizedPayload:   jsonBytes,
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingMsgPack,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (MsgPackSerde) SerializeObject(_ context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
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
			return nil, errors.New("first byte indicates this it not valid JSON, expected brackets")
		}

		var nativeObj any
		err := json.Unmarshal([]byte(trimmed), &nativeObj)
		if err != nil {
			return nil, fmt.Errorf("failed to deserialize json to messagepack payload: %w", err)
		}

		b, err := mp.Marshal(nativeObj)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize messagepack payload: %w", err)
		}

		binData = b
	case []byte:
		trimmed := bytes.TrimLeft(v, " \t\r\n")
		if len(trimmed) != 0 && trimmed[0] == '[' || trimmed[0] == '{' {
			var nativeObj any
			err := json.Unmarshal(trimmed, &nativeObj)
			if err != nil {
				return nil, fmt.Errorf("failed to deserialize json to messagepack payload: %w", err)
			}

			b, err := mp.Marshal(nativeObj)
			if err != nil {
				return nil, fmt.Errorf("failed to serialize messagepack payload: %w", err)
			}

			binData = b
		} else {
			binData = v
		}
	default:
		b, err := mp.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize messagepack payload: %w", err)
		}

		binData = b
	}

	return binData, nil
}
