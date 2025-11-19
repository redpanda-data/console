// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"log/slog"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestParseCompatibilityError demonstrates why the parser exists and how it handles
// the unusual response format from Confluent Schema Registry.
//
// Schema Registry returns compatibility errors with messages that contain invalid JSON:
// - Keys are unquoted (e.g., {errorType:"..."} instead of {"errorType":"..."})
// - Multiple messages contain different pieces of information
// - Some messages contain schema details, versions, and config that need to be skipped
//
// Example real response from Confluent and Redpanda Schema Registry:
//
//	{
//	  "is_compatible": false,
//	  "messages": [
//	    "{errorType:\"FIELD_SCALAR_KIND_CHANGED\", description:\"The kind of a SCALAR field at path '#/Car/2' in the new schema does not match its kind in the old schema\"}",
//	    "{oldSchemaVersion: 1}",
//	    "{oldSchema: 'syntax = \"proto3\";\n\nmessage Car {\n  string make = 1;\n  string model = 2;\n  int32 year = 3;\n}\n'}",
//	    "{compatibility: 'BACKWARD'}"
//	  ]
//	}
func TestParseCompatibilityError_RealResponse(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelWarn}))
	s := &Service{logger: logger}

	// This is the actual response format from Confluent and Redpanda Schema Registry
	// Note: Keys are unquoted, which is invalid JSON
	messages := []string{
		`{errorType:"FIELD_SCALAR_KIND_CHANGED", description:"The kind of a SCALAR field at path '#/Car/2' in the new schema does not match its kind in the old schema"}`,
		`{oldSchemaVersion: 1}`,
		`{oldSchema: 'syntax = "proto3";\n\nmessage Car {\n  string make = 1;\n  string model = 2;\n  int32 year = 3;\n}\n'}`,
		`{compatibility: 'BACKWARD'}`,
	}

	result := s.parseCompatibilityError(messages)

	// The parser should extract the error type and description from the first message
	assert.Equal(t, "FIELD_SCALAR_KIND_CHANGED", result.ErrorType, "Should extract error type from unquoted JSON")
	assert.Equal(t, "The kind of a SCALAR field at path '#/Car/2' in the new schema does not match its kind in the old schema", result.Description, "Should extract description")
}
