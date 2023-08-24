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

func (d AvroSerde) SerializeObject(obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	if !so.schemaIDSet {
		return nil, errors.New("no schema id specified")
	}

	schema, err := d.SchemaSvc.GetAvroSchemaByID(so.schemaId)
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

		if len(trimmed) == 0 {
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

	header, err := appendEncode(nil, int(so.schemaId), nil)
	if err != nil {
		return nil, fmt.Errorf("failed encode binary avro payload: %w", err)
	}

	binData := append(header, b...)

	return binData, nil
}
