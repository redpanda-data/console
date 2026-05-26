// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schemasample_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/types/descriptorpb"

	"github.com/redpanda-data/console/backend/pkg/schemasample"
)

// unmarshal decodes the renderer's JSON output into a Go value for structured
// assertions. Renderers always return MarshalIndent'd JSON, so this is safe.
func unmarshal(t *testing.T, b []byte) any {
	t.Helper()
	var v any
	require.NoError(t, json.Unmarshal(b, &v))
	return v
}

func TestAvro_Primitives(t *testing.T) {
	cases := map[string]any{
		`"null"`:    nil,
		`"boolean"`: false,
		`"int"`:     float64(0),
		`"long"`:    float64(0),
		`"float"`:   float64(0),
		`"double"`:  float64(0),
		`"bytes"`:   "",
		`"string"`:  "",
	}
	for schema, want := range cases {
		t.Run(schema, func(t *testing.T) {
			out, err := schemasample.Avro(schema)
			require.NoError(t, err)
			assert.Equal(t, want, unmarshal(t, out))
		})
	}
}

func TestAvro_Record(t *testing.T) {
	schema := `{
		"type": "record",
		"name": "User",
		"fields": [
			{"name": "id", "type": "long"},
			{"name": "email", "type": "string"},
			{"name": "active", "type": "boolean", "default": true}
		]
	}`
	out, err := schemasample.Avro(schema)
	require.NoError(t, err)
	assert.Equal(t, map[string]any{
		"id":     float64(0),
		"email":  "",
		"active": true, // default honored
	}, unmarshal(t, out))
}

func TestAvro_UnionWithNull(t *testing.T) {
	// Avro JSON encoding: ["null", "string"] for a field renders as bare null
	// (not {"string": ""}) because null is the implicit default for nullable.
	schema := `{
		"type": "record",
		"name": "Wrap",
		"fields": [{"name": "maybe", "type": ["null", "string"]}]
	}`
	out, err := schemasample.Avro(schema)
	require.NoError(t, err)
	assert.Equal(t, map[string]any{"maybe": nil}, unmarshal(t, out))
}

func TestAvro_UnionWithoutNull(t *testing.T) {
	// Non-null union wraps the first branch as {"<branch-key>": value}.
	schema := `{
		"type": "record",
		"name": "Wrap",
		"fields": [{"name": "choice", "type": ["string", "long"]}]
	}`
	out, err := schemasample.Avro(schema)
	require.NoError(t, err)
	assert.Equal(t, map[string]any{
		"choice": map[string]any{"string": ""},
	}, unmarshal(t, out))
}

func TestAvro_Enum(t *testing.T) {
	schema := `{
		"type": "enum",
		"name": "Color",
		"symbols": ["RED", "GREEN", "BLUE"]
	}`
	out, err := schemasample.Avro(schema)
	require.NoError(t, err)
	assert.Equal(t, "RED", unmarshal(t, out))
}

func TestAvro_EnumWithDefault(t *testing.T) {
	schema := `{
		"type": "enum",
		"name": "Color",
		"symbols": ["RED", "GREEN"],
		"default": "GREEN"
	}`
	out, err := schemasample.Avro(schema)
	require.NoError(t, err)
	assert.Equal(t, "GREEN", unmarshal(t, out))
}

func TestAvro_LogicalTypes(t *testing.T) {
	cases := map[string]any{
		`{"type":"string","logicalType":"uuid"}`:           "00000000-0000-0000-0000-000000000000",
		`{"type":"bytes","logicalType":"decimal"}`:         "0",
		`{"type":"int","logicalType":"date"}`:              float64(0),
		`{"type":"long","logicalType":"timestamp-millis"}`: float64(0),
		`{"type":"long","logicalType":"timestamp-micros"}`: float64(0),
	}
	for schema, want := range cases {
		t.Run(schema, func(t *testing.T) {
			out, err := schemasample.Avro(schema)
			require.NoError(t, err)
			assert.Equal(t, want, unmarshal(t, out))
		})
	}
}

func TestAvro_RecursiveRef(t *testing.T) {
	// A record that references itself by name. The renderer must short-circuit
	// when it sees the same named type already on its expansion stack — else
	// it'd recurse forever.
	schema := `{
		"type": "record",
		"name": "Node",
		"fields": [
			{"name": "value", "type": "long"},
			{"name": "next", "type": ["null", "Node"]}
		]
	}`
	out, err := schemasample.Avro(schema)
	require.NoError(t, err)
	v, ok := unmarshal(t, out).(map[string]any)
	require.True(t, ok)
	assert.Equal(t, float64(0), v["value"])
	// next is the null branch of the union, so renders as nil.
	assert.Nil(t, v["next"])
}

func TestAvro_NonRecursiveRecordReference(t *testing.T) {
	// A field whose type is a named record (not the enclosing one). The renderer must expand
	// the referenced record's fields rather than short-circuiting to nil — regression test for
	// a bug where avroSamplePrimitiveOrRef and avroSampleRecord both marked the visited flag,
	// causing the first record reference to render as null.
	schema := `{
		"type": "record",
		"name": "Order",
		"fields": [
			{
				"name": "billing_address",
				"type": {
					"type": "record",
					"name": "Address",
					"fields": [
						{"name": "city", "type": "string"},
						{"name": "zip", "type": "string"}
					]
				}
			},
			{"name": "shipping_address", "type": "Address"}
		]
	}`
	out, err := schemasample.Avro(schema)
	require.NoError(t, err)
	v, ok := unmarshal(t, out).(map[string]any)
	require.True(t, ok)
	expected := map[string]any{"city": "", "zip": ""}
	assert.Equal(t, expected, v["billing_address"])
	assert.Equal(t, expected, v["shipping_address"], "non-recursive record reference must expand, not short-circuit to nil")
}

func TestAvro_NestedNamespaces(t *testing.T) {
	// A record refers to a named type declared in the same namespace by short
	// name. The renderer must resolve via enclosingNS.
	schema := `{
		"type": "record",
		"name": "Order",
		"namespace": "shop",
		"fields": [
			{
				"name": "status",
				"type": {
					"type": "enum",
					"name": "Status",
					"symbols": ["OPEN", "CLOSED"]
				}
			},
			{"name": "previous_status", "type": "Status"}
		]
	}`
	out, err := schemasample.Avro(schema)
	require.NoError(t, err)
	assert.Equal(t, map[string]any{
		"status":          "OPEN",
		"previous_status": "OPEN",
	}, unmarshal(t, out))
}

func TestAvro_ArrayAndMap(t *testing.T) {
	schema := `{
		"type": "record",
		"name": "Bag",
		"fields": [
			{"name": "tags", "type": {"type": "array", "items": "string"}},
			{"name": "props", "type": {"type": "map", "values": "long"}}
		]
	}`
	out, err := schemasample.Avro(schema)
	require.NoError(t, err)
	assert.Equal(t, map[string]any{
		"tags":  []any{},
		"props": map[string]any{},
	}, unmarshal(t, out))
}

func TestJSONSchema_Primitives(t *testing.T) {
	cases := map[string]any{
		`{"type":"string"}`:  "",
		`{"type":"integer"}`: float64(0),
		`{"type":"number"}`:  float64(0),
		`{"type":"boolean"}`: false,
		`{"type":"null"}`:    nil,
	}
	for schema, want := range cases {
		t.Run(schema, func(t *testing.T) {
			out, err := schemasample.JSONSchema(schema)
			require.NoError(t, err)
			assert.Equal(t, want, unmarshal(t, out))
		})
	}
}

func TestJSONSchema_Object(t *testing.T) {
	schema := `{
		"type": "object",
		"properties": {
			"name": {"type": "string"},
			"age": {"type": "integer"}
		}
	}`
	out, err := schemasample.JSONSchema(schema)
	require.NoError(t, err)
	assert.Equal(t, map[string]any{
		"name": "",
		"age":  float64(0),
	}, unmarshal(t, out))
}

func TestJSONSchema_Array(t *testing.T) {
	schema := `{"type":"array","items":{"type":"string"}}`
	out, err := schemasample.JSONSchema(schema)
	require.NoError(t, err)
	assert.Equal(t, []any{""}, unmarshal(t, out))
}

func TestJSONSchema_OneOfPicksFirst(t *testing.T) {
	schema := `{
		"oneOf": [
			{"type": "string"},
			{"type": "integer"}
		]
	}`
	out, err := schemasample.JSONSchema(schema)
	require.NoError(t, err)
	assert.Equal(t, "", unmarshal(t, out))
}

func TestJSONSchema_Const(t *testing.T) {
	out, err := schemasample.JSONSchema(`{"const": "pinned"}`)
	require.NoError(t, err)
	assert.Equal(t, "pinned", unmarshal(t, out))
}

func TestJSONSchema_EnumPicksFirst(t *testing.T) {
	out, err := schemasample.JSONSchema(`{"enum": ["a", "b", "c"]}`)
	require.NoError(t, err)
	assert.Equal(t, "a", unmarshal(t, out))
}

func TestJSONSchema_DefaultWins(t *testing.T) {
	out, err := schemasample.JSONSchema(`{"type":"string","default":"hello"}`)
	require.NoError(t, err)
	assert.Equal(t, "hello", unmarshal(t, out))
}

func TestJSONSchema_RefResolved(t *testing.T) {
	schema := `{
		"$ref": "#/$defs/User",
		"$defs": {
			"User": {
				"type": "object",
				"properties": {"id": {"type": "integer"}}
			}
		}
	}`
	out, err := schemasample.JSONSchema(schema)
	require.NoError(t, err)
	assert.Equal(t, map[string]any{"id": float64(0)}, unmarshal(t, out))
}

func TestJSONSchema_RefCycleTerminates(t *testing.T) {
	// Node refers to itself — the renderer must terminate cleanly.
	schema := `{
		"$ref": "#/$defs/Node",
		"$defs": {
			"Node": {
				"type": "object",
				"properties": {
					"value": {"type": "integer"},
					"next": {"$ref": "#/$defs/Node"}
				}
			}
		}
	}`
	out, err := schemasample.JSONSchema(schema)
	require.NoError(t, err)
	v, ok := unmarshal(t, out).(map[string]any)
	require.True(t, ok)
	assert.Equal(t, float64(0), v["value"])
	// Cyclic ref short-circuits to null.
	assert.Nil(t, v["next"])
}

func TestJSONSchema_RefJSONPointerEscape(t *testing.T) {
	// JSON Pointer: ~1 → /, ~0 → ~. A def key containing '/' must be encoded
	// as ~1 in the $ref.
	schema := `{
		"$ref": "#/$defs/odd~1key",
		"$defs": {
			"odd/key": {"type": "string"}
		}
	}`
	out, err := schemasample.JSONSchema(schema)
	require.NoError(t, err)
	assert.Equal(t, "", unmarshal(t, out))
}

func TestJSONSchema_DefinitionsAlias(t *testing.T) {
	// JSON Schema draft-07 used "definitions" instead of "$defs"; the renderer
	// should accept both.
	schema := `{
		"$ref": "#/definitions/User",
		"definitions": {
			"User": {"type": "object", "properties": {"name": {"type": "string"}}}
		}
	}`
	out, err := schemasample.JSONSchema(schema)
	require.NoError(t, err)
	assert.Equal(t, map[string]any{"name": ""}, unmarshal(t, out))
}

// TestDescriptorByIndexPath exercises the protobuf descriptor walker against a
// hand-built file with one nested level. Going through a real
// FileDescriptorProto rather than mocking exercises the same protoreflect
// surface the production caller uses.
func TestDescriptorByIndexPath(t *testing.T) {
	str := func(s string) *string { return &s }

	fdp := &descriptorpb.FileDescriptorProto{
		Name:    str("test.proto"),
		Syntax:  str("proto3"),
		Package: str("test"),
		MessageType: []*descriptorpb.DescriptorProto{
			{
				Name: str("Outer"),
				NestedType: []*descriptorpb.DescriptorProto{
					{Name: str("Inner")},
					{Name: str("Inner2")},
				},
			},
			{Name: str("Sibling")},
		},
	}
	fd, err := protodesc.NewFile(fdp, nil)
	require.NoError(t, err)

	t.Run("empty path is rejected by caller; loop alone returns nil descriptor", func(t *testing.T) {
		// The function itself doesn't default empty path — that's the caller's
		// (Protobuf) job. Empty path yields nil descriptor + error.
		_, err := schemasample.DescriptorByIndexPath(fd.Messages(), nil)
		require.Error(t, err)
	})

	t.Run("top-level by index 0", func(t *testing.T) {
		desc, err := schemasample.DescriptorByIndexPath(fd.Messages(), []int{0})
		require.NoError(t, err)
		assert.Equal(t, "Outer", string(desc.Name()))
	})

	t.Run("top-level by index 1", func(t *testing.T) {
		desc, err := schemasample.DescriptorByIndexPath(fd.Messages(), []int{1})
		require.NoError(t, err)
		assert.Equal(t, "Sibling", string(desc.Name()))
	})

	t.Run("nested descent", func(t *testing.T) {
		desc, err := schemasample.DescriptorByIndexPath(fd.Messages(), []int{0, 1})
		require.NoError(t, err)
		assert.Equal(t, "Inner2", string(desc.Name()))
	})

	t.Run("out-of-range at top level", func(t *testing.T) {
		_, err := schemasample.DescriptorByIndexPath(fd.Messages(), []int{99})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "out of range")
	})

	t.Run("out-of-range nested", func(t *testing.T) {
		_, err := schemasample.DescriptorByIndexPath(fd.Messages(), []int{0, 99})
		require.Error(t, err)
	})

	t.Run("negative index", func(t *testing.T) {
		_, err := schemasample.DescriptorByIndexPath(fd.Messages(), []int{-1})
		require.Error(t, err)
	})
}
