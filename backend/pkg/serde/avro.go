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
	"context"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/schema"
)

var _ Serde = (*AvroSerde)(nil)

// AvroSerde represents the serde for dealing with Avro types.
type AvroSerde struct {
	schemaClient schema.Client
}

// Name returns the name of the serde payload encoding.
func (AvroSerde) Name() PayloadEncoding {
	return PayloadEncodingAvro
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (d AvroSerde) DeserializePayload(ctx context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	if d.schemaClient == nil {
		return &RecordPayload{}, errors.New("no schema registry configured")
	}

	loc, err := locateSchema(record, payloadType)
	if err != nil {
		return &RecordPayload{}, err
	}

	ctx, schemaID, err := loc.resolve(ctx, d.schemaClient)
	if err != nil {
		return &RecordPayload{}, err
	}

	avroSch, err := d.schemaClient.AvroSchemaByID(ctx, schemaID)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("getting avro schema from registry: %w", err)
	}

	var obj any
	_, err = avroSch.Decode(loc.message(), &obj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("decoding avro: %w", err)
	}

	jsonBytes, err := avroSch.EncodeJSON(obj)
	if err != nil {
		return &RecordPayload{}, fmt.Errorf("serializing avro: %w", err)
	}

	rp := &RecordPayload{
		NormalizedPayload:   jsonBytes,
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingAvro,
	}
	loc.describe(ctx, schemaID, rp)
	return rp, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
//
//nolint:cyclop // lots of supported inputs
func (d AvroSerde) SerializeObject(ctx context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	if so.schemaID == 0 {
		return nil, errors.New("no schema id specified")
	}

	schema, err := d.schemaClient.AvroSchemaByID(ctx, int(so.schemaID))
	if err != nil {
		return nil, fmt.Errorf("getting avro schema from registry: %w", err)
	}

	switch v := obj.(type) {
	case []byte:
		trimmed, startsWithJSON, err := trimJSONInput(v)
		if err != nil {
			return nil, err
		}

		if startsWithJSON {
			var native any
			if err := schema.DecodeJSON(trimmed, &native); err != nil {
				return nil, fmt.Errorf("deserializing: %w", err)
			}
			obj = native
		}
	case string:
		trimmed, startsWithJSON, err := trimJSONInputString(v)
		if err != nil {
			return nil, err
		}

		if startsWithJSON {
			var native any
			if err := schema.DecodeJSON([]byte(trimmed), &native); err != nil {
				return nil, fmt.Errorf("deserializing: %w", err)
			}
			obj = native
		}
	}

	b, err := schema.Encode(obj)
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
