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
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/hamba/avro/v2"
	"github.com/linkedin/goavro"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/schema"
)

var _ Serde = (*AvroSerde)(nil)

// AvroSerde represents the serde for dealing with Avro types.
type AvroSerde struct {
	SchemaSvc *schema.Service
}

// Name returns the name of the serde payload encoding.
func (AvroSerde) Name() PayloadEncoding {
	return PayloadEncodingAvro
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (d AvroSerde) DeserializePayload(ctx context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	if d.SchemaSvc == nil || !d.SchemaSvc.IsEnabled() {
		return &RecordPayload{}, fmt.Errorf("no schema registry configured")
	}

	payload := payloadFromRecord(record, payloadType)

	if len(payload) <= 5 {
		return &RecordPayload{}, fmt.Errorf("payload size is <= 5")
	}

	if payload[0] != byte(0) {
		return &RecordPayload{}, fmt.Errorf("incorrect magic byte for avro")
	}

	schemaID := binary.BigEndian.Uint32(payload[1:5])
	schema, err := d.SchemaSvc.GetAvroSchemaByID(ctx, schemaID)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("getting avro schema from registry: %w", err)
	}

	var obj interface{}
	err = avro.Unmarshal(schema, payload[5:], &obj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("decoding avro: %w", err)
	}

	jsonBytes, err := json.Marshal(obj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("serializing avro: %w", err)
	}

	return &RecordPayload{
		NormalizedPayload:   jsonBytes,
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingAvro,
		SchemaID:            &schemaID,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
//
//nolint:gocognit,cyclop // lots of supported inputs
func (d AvroSerde) SerializeObject(ctx context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	if !so.schemaIDSet {
		return nil, errors.New("no schema id specified")
	}

	schema, err := d.SchemaSvc.GetAvroSchemaByID(ctx, so.schemaID)
	if err != nil {
		return nil, fmt.Errorf("getting avro schema from registry: %w", err)
	}

	avroObj := obj
	switch v := obj.(type) {
	case []byte:
		trimmed := bytes.TrimLeft(v, " \t\r\n")

		if len(trimmed) == 0 {
			return nil, errors.New("payload is empty")
		}

		startsWithJSON := trimmed[0] == '[' || trimmed[0] == '{'
		if startsWithJSON {
			codec, err := goavro.NewCodec(schema.String())
			if err != nil {
				return nil, fmt.Errorf("parsing avro schema: %w", err)
			}

			avroObj, _, err = codec.NativeFromTextual(trimmed)
			if err != nil {
				return nil, fmt.Errorf("deserializing avro json: %w", err)
			}
		}
	case string:
		trimmed := strings.TrimLeft(v, " \t\r\n")

		if trimmed == "" {
			return nil, errors.New("string payload is empty")
		}

		startsWithJSON := trimmed[0] == '[' || trimmed[0] == '{'
		if startsWithJSON {
			codec, err := goavro.NewCodec(schema.String())
			if err != nil {
				return nil, fmt.Errorf("parsing avro schema: %w", err)
			}

			avroObj, _, err = codec.NativeFromTextual([]byte(trimmed))
			if err != nil {
				return nil, fmt.Errorf("deserializing avro json: %w", err)
			}
		}
	}

	b, err := avro.Marshal(schema, avroObj)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize avro: %w", err)
	}

	var index []int
	if so.indexSet {
		index = so.index
		if len(index) == 0 {
			index = []int{0}
		}
	}

	binData, err := appendEncode(nil, int(so.schemaID), index)
	if err != nil {
		return nil, fmt.Errorf("failed encode binary avro payload: %w", err)
	}

	binData = append(binData, b...)

	return binData, nil
}
