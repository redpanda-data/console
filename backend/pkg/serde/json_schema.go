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
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/schema"
)

var _ Serde = (*JSONSchemaSerde)(nil)

// JSONSchemaSerde represents the serde for dealing with JSON types that have a JSON schema.
type JSONSchemaSerde struct {
	SchemaSvc *schema.Service
}

// Name returns the name of the serde payload encoding.
func (JSONSchemaSerde) Name() PayloadEncoding {
	return PayloadEncodingJSONSchema
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (JSONSchemaSerde) DeserializePayload(_ context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	payload := payloadFromRecord(record, payloadType)

	if len(payload) <= 5 {
		return &RecordPayload{}, fmt.Errorf("payload size is < 5 for json schema")
	}

	if payload[0] != byte(0) {
		return &RecordPayload{}, fmt.Errorf("incorrect magic byte for json schema")
	}

	schemaID := binary.BigEndian.Uint32(payload[1:5])

	jsonPayload := payload[5:]
	obj, err := jsonDeserializePayload(jsonPayload)
	if err != nil {
		return &RecordPayload{}, err
	}

	return &RecordPayload{
		NormalizedPayload:   jsonPayload,
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingJSON,
		SchemaID:            &schemaID,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (d JSONSchemaSerde) SerializeObject(ctx context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	so := serdeCfg{}
	for _, o := range opts {
		o.apply(&so)
	}

	if so.schemaID == 0 {
		return nil, errors.New("no schema id specified")
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

	schema, err := d.SchemaSvc.GetJSONSchemaByID(ctx, so.schemaID)
	if err != nil {
		return nil, fmt.Errorf("getting JSON schema from registry: %w", err)
	}

	var vObj any
	if err := json.Unmarshal(trimmed, &vObj); err != nil {
		return nil, fmt.Errorf("error unmarshaling json object: %w", err)
	}

	if err = schema.Validate(vObj); err != nil {
		return nil, fmt.Errorf("error validating json schema: %w", err)
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
		return nil, fmt.Errorf("failed encode json schema payload: %w", err)
	}

	binData = append(binData, trimmed...)

	return binData, nil
}
