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
	"encoding/binary"
	"encoding/json"
	"fmt"

	"github.com/hamba/avro/v2"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/schema"
)

var _ Serde = (*AvroSerde)(nil)

type AvroSerde struct {
	SchemaSvc *schema.Service
}

func (AvroSerde) Name() PayloadEncoding {
	return PayloadEncodingAvro
}

func (d AvroSerde) DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error) {
	if d.SchemaSvc == nil {
		return RecordPayload{}, fmt.Errorf("no schema registry configured")
	}

	if !d.SchemaSvc.IsEnabled() {
		return RecordPayload{}, fmt.Errorf("schema registry configuration disabled")
	}

	payload := payloadFromRecord(record, payloadType)

	if len(payload) <= 5 {
		return RecordPayload{}, fmt.Errorf("payload size is < 5")
	}

	if payload[0] != byte(0) {
		return RecordPayload{}, fmt.Errorf("incorrect magic byte")
	}

	schemaID := binary.BigEndian.Uint32(payload[1:5])
	schema, err := d.SchemaSvc.GetAvroSchemaByID(schemaID)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("getting avro schema from registry: %w", err)
	}

	var obj interface{}
	err = avro.Unmarshal(schema, payload[5:], &obj)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("decoding avro: %w", err)
	}

	jsonBytes, err := json.Marshal(obj)
	if err != nil {
		return RecordPayload{}, fmt.Errorf("serializing avro: %w", err)
	}

	return RecordPayload{
		NormalizedPayload:   jsonBytes,
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingAvro,
	}, nil
}
