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
	"strconv"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v5"
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
	return PayloadEncodingJSON
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

	r, err := jsonDeserializePayload(payload[5:])
	if r != nil {
		r.SchemaID = &schemaID
	}

	return r, err
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (JSONSchemaSerde) SerializeObject(_ context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
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

	trimmed := bytes.TrimLeft(byteData, " \t\r\n")

	if len(trimmed) == 0 {
		return nil, fmt.Errorf("after trimming whitespaces there were no characters left")
	}

	startsWithJSON := trimmed[0] == '[' || trimmed[0] == '{'
	if !startsWithJSON {
		return nil, fmt.Errorf("first byte indicates this it not valid JSON, expected brackets")
	}

	// Here we would get the schema by ID and validate against schema, but
	// Redpanda currently does not support JSON Schema in the schema registry so we cannot do it.
	// Just add the header to the payload.

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

//nolint:unused // could be useful when we support JSON schemas
func (s *JSONSchemaSerde) validate(ctx context.Context, data []byte, schemaRes *schema.SchemaResponse) error {
	sch, err := s.compileJSONSchema(ctx, schemaRes)
	if err != nil {
		return fmt.Errorf("error compiling json schema: %w", err)
	}

	var vObj interface{}
	if err := json.Unmarshal(data, &vObj); err != nil {
		return fmt.Errorf("error validating json schema: %w", err)
	}

	if err = sch.Validate(vObj); err != nil {
		return fmt.Errorf("error validating json schema: %w", err)
	}

	return nil
}

//nolint:unused // could be useful when we support JSON schemas
func (s *JSONSchemaSerde) compileJSONSchema(ctx context.Context, schemaRes *schema.SchemaResponse) (*jsonschema.Schema, error) {
	c := jsonschema.NewCompiler()
	schemaName := "redpanda_json_schema_main.json"

	err := s.buildJSONSchemaWithReferences(ctx, c, schemaName, schemaRes)
	if err != nil {
		return nil, err
	}

	return c.Compile(schemaName)
}

//nolint:unused // could be useful when we support JSON schemas
func (s *JSONSchemaSerde) buildJSONSchemaWithReferences(ctx context.Context, compiler *jsonschema.Compiler, name string, schemaRes *schema.SchemaResponse) error {
	if err := compiler.AddResource(name, strings.NewReader(schemaRes.Schema)); err != nil {
		return err
	}

	for _, reference := range schemaRes.References {
		schemaRef, err := s.SchemaSvc.GetSchemaBySubjectAndVersion(ctx, reference.Subject, strconv.Itoa(reference.Version))
		if err != nil {
			return err
		}
		if err := compiler.AddResource(reference.Name, strings.NewReader(schemaRef.Schema)); err != nil {
			return err
		}
		if err := s.buildJSONSchemaWithReferences(ctx, compiler, reference.Name, &schema.SchemaResponse{
			Schema:     schemaRef.Schema,
			References: schemaRef.References,
		}); err != nil {
			return err
		}
	}

	return nil
}
