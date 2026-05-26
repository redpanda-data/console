// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"errors"
	"fmt"

	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/schemasample"
)

// GenerateSchemaSampleJSON returns a zero-valued JSON skeleton for the schema
// identified by schemaID. The shape depends on the schema's registered type:
//
//   - AVRO: walks the schema JSON and emits valid Avro JSON encoding (unions
//     including null serialize as null; non-null unions wrap the chosen branch).
//   - JSON: walks the JSON Schema and emits zero values per type (string="",
//     integer/number=0, boolean=false, array=[], object={...}).
//   - PROTOBUF: resolves the descriptor via the schema-registry cache, then
//     marshals an empty dynamicpb message with EmitDefaultValues. indexPath
//     selects the message inside the schema; empty means first top-level.
func (s *Service) GenerateSchemaSampleJSON(ctx context.Context, schemaID int, indexPath []int) ([]byte, error) {
	if s.cachedSchemaClient == nil {
		return nil, errors.New("schema registry is not configured")
	}

	sch, err := s.cachedSchemaClient.SchemaByID(ctx, schemaID)
	if err != nil {
		return nil, fmt.Errorf("failed to load schema %d: %w", schemaID, err)
	}

	switch sch.Type {
	case sr.TypeAvro:
		return schemasample.Avro(sch.Schema)
	case sr.TypeJSON:
		return schemasample.JSONSchema(sch.Schema)
	case sr.TypeProtobuf:
		return s.generateProtobufSample(ctx, schemaID, indexPath)
	default:
		return nil, fmt.Errorf("unsupported schema type %q for sample generation", sch.Type.String())
	}
}

func (s *Service) generateProtobufSample(ctx context.Context, schemaID int, indexPath []int) ([]byte, error) {
	files, rootFilename, err := s.cachedSchemaClient.ProtoFilesByID(ctx, schemaID)
	if err != nil {
		return nil, fmt.Errorf("failed to load proto files for schema %d: %w", schemaID, err)
	}
	return schemasample.Protobuf(files, rootFilename, indexPath)
}
