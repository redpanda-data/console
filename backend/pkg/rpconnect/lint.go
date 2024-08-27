// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package rpconnect provides functionality used in endpoints for Redpanda Connect.
package rpconnect

import (
	"fmt"

	"github.com/redpanda-data/benthos/v4/public/service"
)

// Linter lints Redpanda connect configs.
type Linter struct {
	linter *service.StreamConfigLinter
}

// NewLinter creates a new Linter instance.
func NewLinter() (*Linter, error) {
	schema, err := service.ConfigSchemaFromJSONV0(schemaBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse schema: %w", err)
	}

	return &Linter{
		linter: schema.NewStreamConfigLinter(),
	}, nil
}

// LintYAMLConfig attempts to parse a config in YAML format and, if successful,
// returns a slice of linting errors, or an error if the parsing failed.
func (l *Linter) LintYAMLConfig(config []byte) ([]service.Lint, error) {
	return l.linter.LintYAML(config)
}
