// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schema

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeContextName(t *testing.T) {
	tests := map[string]string{
		"":          "",
		" ":         "",
		".":         "",
		":.:":       "",
		".prod":     ".prod",
		"prod":      ".prod",
		":.prod:":   ".prod",
		" .prod ":   ".prod",
		".team.sub": ".team.sub",
	}
	for input, expected := range tests {
		assert.Equal(t, expected, NormalizeContextName(input), "input %q", input)
	}
}

func TestContextFromSubject(t *testing.T) {
	tests := map[string]string{
		"orders-value":                  "",
		":.outgo:orders-value":          ".outgo",
		":.outgo:":                      ".outgo",
		":.team.sub:orders-value":       ".team.sub",
		":.outgo:with:colons":           ".outgo",
		"weird:.outgo:not-a-prefix":     "",
		":*:orders-value":               "",
		":.default-looking.context:sub": ".default-looking.context",
	}
	for input, expected := range tests {
		assert.Equal(t, expected, ContextFromSubject(input), "input %q", input)
	}
}

func TestInContext(t *testing.T) {
	ctx := context.Background()
	assert.Empty(t, ContextName(ctx), "a plain context selects the default context")

	scoped := InContext(ctx, "prod")
	assert.Equal(t, ".prod", ContextName(scoped), "the name is normalized")
	assert.Empty(t, ContextName(ctx), "the parent context is left untouched")

	assert.Empty(t, ContextName(InContext(scoped, ".")), "a nested default context wins over the parent")
	assert.Equal(t, ".staging", ContextName(InContext(scoped, ".staging")), "a nested named context wins over the parent")
}
