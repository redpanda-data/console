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
	"encoding/json"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/schema"
)

var _ Serde = (*JSONSchemaSerde)(nil)

// JSONSchemaSerde represents the serde for dealing with JSON types that have a JSON schema.
type JSONSchemaSerde struct {
	schemaClient schema.Client
}

// Name returns the name of the serde payload encoding.
func (JSONSchemaSerde) Name() PayloadEncoding {
	return PayloadEncodingJSONSchema
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (d JSONSchemaSerde) DeserializePayload(ctx context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	loc, err := locateSchema(record, payloadType)
	if err != nil {
		return &RecordPayload{}, err
	}

	jsonPayload := loc.message()
	obj, err := jsonDeserializePayload(jsonPayload)
	if err != nil {
		return &RecordPayload{}, err
	}

	// A schema ID needs no registry request, a GUID is looked up.
	ctx, schemaID, err := loc.resolve(ctx, d.schemaClient)
	if err != nil {
		return &RecordPayload{}, err
	}

	rp := &RecordPayload{
		NormalizedPayload:   jsonPayload,
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingJSON,
	}
	loc.describe(ctx, schemaID, rp)
	return rp, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
//
//nolint:cyclop // complex logic
func (d JSONSchemaSerde) SerializeObject(ctx context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	if d.schemaClient == nil {
		return nil, errors.New("schema registry client is not configured")
	}

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
		return nil, errors.New("first byte indicates this it not valid JSON, expected brackets")
	}

	schema, err := d.schemaClient.SchemaByID(ctx, int(so.schemaID))
	if err != nil {
		return nil, fmt.Errorf("getting JSON schema from registry: %w", err)
	}

	if schema.Type != sr.TypeJSON {
		return nil, fmt.Errorf("invalid schema type for given schema id, expected %q, got %q", sr.TypeJSON.String(), schema.Type.String())
	}

	var vObj any
	if err := json.Unmarshal(trimmed, &vObj); err != nil {
		return nil, fmt.Errorf("error unmarshaling json object: %w", err)
	}

	jsonSchema, err := d.schemaClient.ParseJSONSchema(ctx, schema)
	if err != nil {
		return nil, fmt.Errorf("error parsing JSON schema: %w", err)
	}

	if err = jsonSchema.Validate(vObj); err != nil {
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
