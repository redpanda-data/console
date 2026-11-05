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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/avro"
)

func TestStripArrayAndMapNames(t *testing.T) {
	rewrittenTo := func(expected string) func(*testing.T, string, string) {
		return func(t *testing.T, input, output string) {
			_, err := avro.Parse(input)
			require.Error(t, err, "twmb/avro accepts the input as is, so the case tests nothing")

			assert.JSONEq(t, expected, output)
			parsed, err := avro.Parse(output)
			require.NoError(t, err)
			assert.Equal(t, string(avro.MustParse(expected).Canonical()), string(parsed.Canonical()))
		}
	}
	unchanged := func(t *testing.T, input, output string) {
		assert.Equal(t, input, output)
	}
	unchangedAndAccepted := func(t *testing.T, input, output string) {
		unchanged(t, input, output)
		_, err := avro.Parse(input)
		require.NoError(t, err, "the helper skips this input because twmb/avro accepts it")
	}

	tests := []struct {
		name       string
		input      string
		validateFn func(t *testing.T, input, output string)
	}{
		{
			name:       "name on map",
			input:      `{"type":"map","name":"tag","values":"string"}`,
			validateFn: rewrittenTo(`{"type":"map","values":"string"}`),
		},
		{
			name:       "name on array",
			input:      `{"type":"array","name":"item","items":"string"}`,
			validateFn: rewrittenTo(`{"type":"array","items":"string"}`),
		},
		{
			name: "names nested in fields, unions and containers",
			input: `{"type":"record","name":"Order","namespace":"com.acme","fields":[
				{"name":"lines","type":["null",{"type":"record","name":"Lines","fields":[
					{"name":"byWarehouse","type":{"type":"map","name":"warehouse","values":
						{"type":"array","name":"line","items":{"type":"map","name":"attr","values":"string"}}}}
				]}],"default":null},
				{"name":"failure","type":["null",{"type":"error","name":"Failure","fields":[
					{"name":"codes","type":{"type":"array","name":"code","items":"int"}}
				]}],"default":null}
			]}`,
			validateFn: rewrittenTo(`{"type":"record","name":"Order","namespace":"com.acme","fields":[
				{"name":"lines","type":["null",{"type":"record","name":"Lines","fields":[
					{"name":"byWarehouse","type":{"type":"map","values":
						{"type":"array","items":{"type":"map","values":"string"}}}}
				]}],"default":null},
				{"name":"failure","type":["null",{"type":"error","name":"Failure","fields":[
					{"name":"codes","type":{"type":"array","items":"int"}}
				]}],"default":null}
			]}`),
		},
		{
			name: "rewrite keeps number literals",
			input: `{"type":"record","name":"R","fields":[
				{"name":"id","type":"long","default":9007199254740993},
				{"name":"weights","type":{"type":"map","name":"weight","values":"double"},"default":{"pi":3.141592653589793238}}
			]}`,
			validateFn: func(t *testing.T, _, output string) {
				assert.NotContains(t, output, `"weight"`)
				assert.Contains(t, output, `9007199254740993`)
				assert.Contains(t, output, `3.141592653589793238`)
				_, err := avro.Parse(output)
				require.NoError(t, err)
			},
		},
		{
			name: "dotted name on array does not scope the nested record",
			input: `{"type":"record","name":"R","namespace":"top","fields":[
				{"name":"box","type":{"type":"array","name":"wrong.Box","items":{"type":"record","name":"Inner","fields":[]}}},
				{"name":"ref","type":"top.Inner"}
			]}`,
			validateFn: rewrittenTo(`{"type":"record","name":"R","namespace":"top","fields":[
				{"name":"box","type":{"type":"array","items":{"type":"record","name":"Inner","fields":[]}}},
				{"name":"ref","type":"top.Inner"}
			]}`),
		},
		{
			name: "name on map that matches a record does not shadow it",
			input: `{"type":"record","name":"R","namespace":"top","fields":[
				{"name":"inner","type":{"type":"record","name":"Inner","fields":[]}},
				{"name":"counts","type":{"type":"map","name":"top.Inner","values":"int"}},
				{"name":"ref","type":"top.Inner"}
			]}`,
			validateFn: rewrittenTo(`{"type":"record","name":"R","namespace":"top","fields":[
				{"name":"inner","type":{"type":"record","name":"Inner","fields":[]}},
				{"name":"counts","type":{"type":"map","values":"int"}},
				{"name":"ref","type":"top.Inner"}
			]}`),
		},
		{
			name:  "two maps in one union are still rejected",
			input: `["null",{"type":"map","name":"a","values":"int"},{"type":"map","name":"b","values":"string"}]`,
			validateFn: func(t *testing.T, _, output string) {
				_, err := avro.Parse(output)
				require.ErrorContains(t, err, "duplicate union type")
			},
		},
		{
			name:       "named types keep their names",
			input:      `{"type":"record","name":"R","fields":[{"name":"e","type":{"type":"enum","name":"E","symbols":["A"]}},{"name":"f","type":{"type":"fixed","name":"F","size":2}}]}`,
			validateFn: unchangedAndAccepted,
		},
		{
			name:       "field called name and a default that looks like a schema",
			input:      `{"type":"record","name":"R","fields":[{"name":"name","type":{"type":"map","values":"string"},"default":{"type":"map","name":"tag"}}]}`,
			validateFn: unchangedAndAccepted,
		},
		{
			name:       "namespace and empty name are accepted by twmb/avro",
			input:      `{"type":"array","namespace":"x","name":"","items":"string"}`,
			validateFn: unchangedAndAccepted,
		},
		{
			name:       "primitive",
			input:      `"string"`,
			validateFn: unchangedAndAccepted,
		},
		{
			name:       "invalid JSON is left for the parser to report",
			input:      `{"type":"map","name":"tag",`,
			validateFn: unchanged,
		},
		{
			name:       "trailing data is left for the parser to report",
			input:      `{"type":"map","name":"tag","values":"string"} {}`,
			validateFn: unchanged,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tc.validateFn(t, tc.input, stripArrayAndMapNames(tc.input))
		})
	}
}
