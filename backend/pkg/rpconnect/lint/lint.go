// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package rpconnect provides functionality used in endpoints for Redpanda Connect.
package lint

import (
	_ "embed"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/benthosdev/benthos/v4/public/service"

	"github.com/redpanda-data/console/backend/pkg/rpconnect/schema"
)

// Linter lints Redpanda connect configs.
type Linter struct {
	linter *service.StreamConfigLinter
	env    *service.Environment
}

// NewLinter creates a new Linter instance.
func NewLinter() (*Linter, error) {
	schema, err := service.ConfigSchemaFromJSONV0(schema.SchemaBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse schema: %w", err)
	}

	return &Linter{
		linter: schema.NewStreamConfigLinter(),
		env:    schema.Environment(),
	}, nil
}

// LintYAMLConfig attempts to parse a config in YAML format and, if successful,
// returns a slice of linting errors, or an error if the parsing failed.
func (l *Linter) LintYAMLConfig(config []byte) ([]service.Lint, error) {
	return l.linter.LintYAML(config)
}

func (l *Linter) LintYAML(config []byte) (errs []service.Lint) {
	stream := l.env.NewStreamBuilder()
	err := stream.SetYAML(string(config))
	if err == nil {
		return
	}
	var lintErrs service.LintError
	if errors.As(err, &lintErrs) {
		for _, lint := range lintErrs {
			errs = append(errs, lint)
		}
	} else {
		errs = append(errs, yamlErrToList(err)...)
	}
	return
}

func extractLineNumber(str string) (line int, remaining string) {
	if !strings.HasPrefix(str, "line") {
		return 1, str
	}

	parts := strings.SplitN(str, ":", 2)
	if len(parts) < 2 {
		parts = []string{"", parts[0]}
	}
	remaining = strings.TrimSpace(parts[1])

	// Default to line one
	line = 1
	if len(parts[0]) > 5 {
		if parsedLine, _ := strconv.ParseInt(parts[0][5:], 10, 64); parsedLine > 0 {
			line = int(parsedLine)
		}
	}
	return
}

func yamlErrToList(err error) []service.Lint {
	errStr := err.Error()
	guessLine := 1
	for strings.HasPrefix(errStr, "line ") {
		guessLine, errStr = extractLineNumber(errStr)
	}
	if !strings.HasPrefix(errStr, "yaml: ") {
		return []service.Lint{{Line: guessLine, What: errStr}}
	}
	if strings.HasPrefix(errStr, "yaml: unmarshal errors:\n  ") {
		errStr = errStr[26:]
	} else {
		errStr = errStr[6:]
	}
	var confErrs []service.Lint
	for _, errLine := range strings.Split(errStr, "\n  ") {
		confErr := service.Lint{}
		confErr.Line, confErr.What = extractLineNumber(errLine)
		confErrs = append(confErrs, confErr)
	}
	return confErrs
}
