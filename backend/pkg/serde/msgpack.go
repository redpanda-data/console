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
	"encoding/base64"
	"encoding/json"
	"fmt"

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
