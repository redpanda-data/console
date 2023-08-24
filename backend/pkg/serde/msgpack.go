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
	"errors"
	"fmt"
	"strings"

	"github.com/twmb/franz-go/pkg/kgo"
	mp "github.com/vmihailenco/msgpack/v5"

	"github.com/redpanda-data/console/backend/pkg/msgpack"
)

var _ Serde = (*MsgPackSerde)(nil)

type MsgPackSerde struct {
	MsgPackService *msgpack.Service
}

func (MsgPackSerde) Name() PayloadEncoding {
	return PayloadEncodingMsgPack
}

func (d MsgPackSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error) {
	if d.MsgPackService == nil {
		return RecordPayload{}, fmt.Errorf("no message pack service configured")
	}

	if !d.MsgPackService.IsTopicAllowed(record.Topic) {
		return RecordPayload{}, fmt.Errorf("message pack encoding not configured for topic: " + record.Topic)
	}

	payload := payloadFromRecord(record, payloadType)

	var obj interface{}
	err := mp.Unmarshal(payload, &obj)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("decoding message pack payload: %w", err)
	}

	b64 := base64.StdEncoding.EncodeToString(payload)
	jsonBytes, err := json.Marshal(b64)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("decoding message pack payload: %w", err)
	}

	return RecordPayload{
		NormalizedPayload:   jsonBytes,
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingMsgPack,
	}, nil
}

func (d MsgPackSerde) SerializeObject(obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	var binData []byte
	switch v := obj.(type) {
	case string:
		trimmed := strings.TrimLeft(v, " \t\r\n")

		if len(trimmed) == 0 {
			return nil, errors.New("string payload is empty")
		}

		startsWithJSON := trimmed[0] == '[' || trimmed[0] == '{'
		if !startsWithJSON {
			return nil, fmt.Errorf("first byte indicates this it not valid JSON, expected brackets")
		}

		var nativeObj interface{}
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

			var nativeObj interface{}
			err := json.Unmarshal([]byte(trimmed), &nativeObj)
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

	if so.schemaIDSet {
		var index []int = nil
		if so.indexSet {
			index = so.index
			if len(index) == 0 {
				index = []int{0}
			}
		}

		header, err := appendEncode(nil, int(so.schemaId), index)
		if err != nil {
			return nil, fmt.Errorf("failed encode binary messagepack payload: %w", err)
		}

		b := append(header, binData...)
		binData = b
	}

	return binData, nil
}
