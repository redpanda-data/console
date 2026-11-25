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
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/twmb/franz-go/pkg/sr"
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

func TestPickContextID(t *testing.T) {
	inDefault := sr.ContextID{Context: ".", ID: 2}
	inProd := sr.ContextID{Context: ".prod", ID: 5}
	inStaging := sr.ContextID{Context: ".staging", ID: 9}

	tests := []struct {
		name      string
		ids       []sr.ContextID
		preferred string
		want      sr.ContextID
		wantOK    bool
	}{
		{name: "no IDs", preferred: ".prod"},
		{
			name:      "the preferred context",
			ids:       []sr.ContextID{inDefault, inProd, inStaging},
			preferred: ".prod",
			want:      inProd,
			wantOK:    true,
		},
		{
			name:      "the preferred context in another spelling",
			ids:       []sr.ContextID{inDefault, inProd},
			preferred: ":.prod:",
			want:      inProd,
			wantOK:    true,
		},
		{
			name:      "the default context is preferred",
			ids:       []sr.ContextID{inProd, inDefault},
			preferred: "",
			want:      sr.ContextID{Context: "", ID: 2},
			wantOK:    true,
		},
		{
			name:      "the default context when the preferred one has no ID",
			ids:       []sr.ContextID{inProd, inDefault, inStaging},
			preferred: ".other",
			want:      sr.ContextID{Context: "", ID: 2},
			wantOK:    true,
		},
		{
			name:      "the first listed when neither has an ID",
			ids:       []sr.ContextID{inProd, inStaging},
			preferred: ".other",
			want:      inProd,
			wantOK:    true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := PickContextID(tc.ids, tc.preferred)
			assert.Equal(t, tc.wantOK, ok)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestIsRouteNotFound(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "Redpanda 25.3 unknown route", err: &sr.ResponseError{StatusCode: http.StatusNotFound, Message: "Not found"}, want: true},
		{name: "Redpanda 26.3 unknown route", err: &sr.ResponseError{StatusCode: http.StatusNotFound, ErrorCode: 404}, want: true},
		{name: "wrapped", err: fmt.Errorf("lookup: %w", &sr.ResponseError{StatusCode: http.StatusNotFound}), want: true},
		{name: "unknown schema", err: &sr.ResponseError{StatusCode: http.StatusNotFound, ErrorCode: 40403}, want: false},
		{name: "unknown subject", err: &sr.ResponseError{StatusCode: http.StatusNotFound, ErrorCode: 40401}, want: false},
		{name: "server error", err: &sr.ResponseError{StatusCode: http.StatusInternalServerError}, want: false},
		{name: "other error", err: errors.New("connection refused"), want: false},
		{name: "no error", err: nil, want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, IsRouteNotFound(tc.err))
		})
	}
}
