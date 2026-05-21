// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package schemasample renders zero-valued JSON skeletons for Avro,
// JSON Schema, and Protobuf schemas. The renderers are pure — they take
// already-resolved schema text or descriptors and don't touch the schema
// registry — so callers that fetch a schema separately can plug them in.
package schemasample

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/bufbuild/protocompile/linker"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/dynamicpb"
)

// Avro/JSON-Schema literal type names. Extracted as constants so goconst doesn't
// flag the repeated occurrences and to make typos compile-time errors.
const (
	avroTypeNull    = "null"
	avroTypeBool    = "boolean"
	avroTypeInt     = "int"
	avroTypeLong    = "long"
	avroTypeFloat   = "float"
	avroTypeDouble  = "double"
	avroTypeBytes   = "bytes"
	avroTypeString  = "string"
	avroTypeRecord  = "record"
	avroTypeEnum    = "enum"
	avroTypeFixed   = "fixed"
	avroTypeArray   = "array"
	avroTypeMap     = "map"
	jsonTypeObject  = "object"
	jsonTypeArray   = "array"
	jsonTypeString  = "string"
	jsonTypeInteger = "integer"
	jsonTypeNumber  = "number"
	jsonTypeBool    = "boolean"
	jsonTypeNull    = "null"
)

// Avro renders a zero-valued JSON skeleton for an Avro schema. Unions
// containing null serialize as bare null; non-null unions wrap the first
// branch as {"<branch-key>": value}. Recursive types short-circuit to null
// when re-encountered.
func Avro(schemaText string) ([]byte, error) {
	var raw any
	if err := json.Unmarshal([]byte(schemaText), &raw); err != nil {
		return nil, fmt.Errorf("failed to parse avro schema JSON: %w", err)
	}
	registry := map[string]any{}
	collectAvroNamed(raw, "", registry)
	val := avroSample(raw, "", registry, map[string]bool{})
	return json.MarshalIndent(val, "", "  ")
}

// JSONSchema renders a zero-valued JSON skeleton for a JSON Schema document.
// Supports the common subset used in schema-registry-attached schemas:
// object/array/string/integer/number/boolean/null, enum, const, oneOf/anyOf
// /allOf (first-branch), and $ref resolution against $defs / definitions
// (cycles short-circuit).
func JSONSchema(schemaText string) ([]byte, error) {
	var root any
	if err := json.Unmarshal([]byte(schemaText), &root); err != nil {
		return nil, fmt.Errorf("failed to parse JSON schema: %w", err)
	}
	defs := collectJSONDefs(root)
	val := jsonSchemaSample(root, defs, map[string]bool{})
	return json.MarshalIndent(val, "", "  ")
}

// Protobuf renders a zero-valued JSON skeleton for the Protobuf message
// located at indexPath inside rootFilename's nested message tree. An empty
// indexPath selects the first top-level message.
func Protobuf(files linker.Files, rootFilename string, indexPath []int) ([]byte, error) {
	if files == nil {
		return nil, errors.New("nil proto files")
	}
	rootFile := files.FindFileByPath(rootFilename)
	if rootFile == nil {
		return nil, fmt.Errorf("root proto file %q not found", rootFilename)
	}

	path := indexPath
	if len(path) == 0 {
		path = []int{0}
	}
	desc, err := DescriptorByIndexPath(rootFile.Messages(), path)
	if err != nil {
		return nil, err
	}

	msg := dynamicpb.NewMessage(desc)
	return protojson.MarshalOptions{
		EmitDefaultValues: true,
		Multiline:         true,
		Indent:            "  ",
		Resolver:          files.AsResolver(),
	}.Marshal(msg)
}

// DescriptorByIndexPath walks msgs by successive nested-message indices,
// returning the descriptor at the end of the path. Each path element selects
// a sibling at the current level; the next element descends into that
// sibling's nested messages.
func DescriptorByIndexPath(msgs protoreflect.MessageDescriptors, path []int) (protoreflect.MessageDescriptor, error) {
	var current protoreflect.MessageDescriptor
	siblings := msgs
	for _, idx := range path {
		if idx < 0 || idx >= siblings.Len() {
			return nil, fmt.Errorf("message index %d out of range (have %d siblings)", idx, siblings.Len())
		}
		current = siblings.Get(idx)
		siblings = current.Messages()
	}
	if current == nil {
		return nil, errors.New("index path resolved to no message descriptor")
	}
	return current, nil
}

// --- AVRO -----------------------------------------------------------------
// We walk the schema JSON directly rather than the compiled *avro.Schema
// because the latter doesn't expose its node tree.

// stringField extracts a string keyed in m, returning "" when the key is
// missing or holds a non-string value.
func stringField(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// avroFullName resolves the fully-qualified name of a named Avro type given
// its declared namespace (if any) and the enclosing namespace.
func avroFullName(name, declaredNS, enclosingNS string) string {
	ns := declaredNS
	if ns == "" {
		ns = enclosingNS
	}
	if ns == "" {
		return name
	}
	return ns + "." + name
}

// collectAvroNamed walks the schema tree once to record fully-qualified names
// for record/enum/fixed types so later references can resolve them. Only
// fullnames are stored — short-name lookups happen at resolve time using
// enclosingNS to avoid cross-namespace collisions (e.g. `a.Status` vs `b.Status`).
func collectAvroNamed(node any, enclosingNS string, out map[string]any) {
	switch v := node.(type) {
	case []any:
		for _, branch := range v {
			collectAvroNamed(branch, enclosingNS, out)
		}
	case map[string]any:
		collectAvroNamedFromMap(v, enclosingNS, out)
	}
}

func collectAvroNamedFromMap(v map[string]any, enclosingNS string, out map[string]any) {
	t := stringField(v, "type")
	switch t {
	case avroTypeRecord, avroTypeEnum, avroTypeFixed:
		name := stringField(v, "name")
		declaredNS := stringField(v, "namespace")
		ns := declaredNS
		if ns == "" {
			ns = enclosingNS
		}
		out[avroFullName(name, declaredNS, enclosingNS)] = v
		if t == avroTypeRecord {
			fields, ok := v["fields"].([]any)
			if !ok {
				return
			}
			for _, f := range fields {
				fm, ok := f.(map[string]any)
				if !ok {
					continue
				}
				collectAvroNamed(fm["type"], ns, out)
			}
		}
	case avroTypeArray:
		collectAvroNamed(v["items"], enclosingNS, out)
	case avroTypeMap:
		collectAvroNamed(v["values"], enclosingNS, out)
	}
}

// avroLookup resolves a (possibly short) named reference using enclosingNS,
// falling back to the bare name. Returns the registered schema and whether
// it was found.
func avroLookup(name, enclosingNS string, registry map[string]any) (any, bool) {
	if enclosingNS != "" {
		if v, ok := registry[enclosingNS+"."+name]; ok {
			return v, true
		}
	}
	if v, ok := registry[name]; ok {
		return v, true
	}
	return nil, false
}

// avroSample emits a zero-valued sample for the node. visited tracks the
// fullnames currently being expanded so recursive types (`record A { next: A }`)
// don't blow the stack — when we re-encounter a name we return nil.
func avroSample(node any, enclosingNS string, registry map[string]any, visited map[string]bool) any {
	switch v := node.(type) {
	case string:
		return avroSamplePrimitiveOrRef(v, enclosingNS, registry, visited)
	case []any:
		return avroSampleUnion(v, enclosingNS, registry, visited)
	case map[string]any:
		return avroSampleObject(v, enclosingNS, registry, visited)
	}
	return nil
}

func avroSamplePrimitiveOrRef(name, enclosingNS string, registry map[string]any, visited map[string]bool) any {
	switch name {
	case avroTypeNull:
		return nil
	case avroTypeBool:
		return false
	case avroTypeInt, avroTypeLong:
		return 0
	case avroTypeFloat, avroTypeDouble:
		return 0.0
	case avroTypeBytes, avroTypeString:
		return ""
	}
	// Named reference — let avroSampleRecord own the visited-flag bookkeeping. Marking the flag
	// here as well caused the first reference to a non-recursive record to render as nil.
	ref, ok := avroLookup(name, enclosingNS, registry)
	if !ok {
		return ""
	}
	return avroSample(ref, enclosingNS, registry, visited)
}

// avroSampleUnion implements Avro JSON union encoding: a null branch renders
// as bare null; otherwise the first branch is wrapped as {"<branch-key>": value}.
func avroSampleUnion(branches []any, enclosingNS string, registry map[string]any, visited map[string]bool) any {
	for _, branch := range branches {
		if s, ok := branch.(string); ok && s == avroTypeNull {
			return nil
		}
	}
	if len(branches) == 0 {
		return nil
	}
	first := branches[0]
	return map[string]any{
		avroBranchKey(first, enclosingNS): avroSample(first, enclosingNS, registry, visited),
	}
}

func avroSampleObject(v map[string]any, enclosingNS string, registry map[string]any, visited map[string]bool) any {
	t := stringField(v, "type")
	switch t {
	case avroTypeRecord:
		return avroSampleRecord(v, enclosingNS, registry, visited)
	case avroTypeEnum:
		return avroSampleEnum(v)
	case avroTypeArray:
		return []any{}
	case avroTypeMap:
		return map[string]any{}
	case avroTypeFixed:
		return ""
	}
	// Logical types on a primitive base, e.g. {"type":"long","logicalType":"timestamp-millis"}.
	if lt, ok := v["logicalType"].(string); ok {
		if val, ok := avroSampleLogicalType(lt); ok {
			return val
		}
	}
	// Inline type wrapper like {"type":"string"}.
	if t != "" {
		return avroSample(t, enclosingNS, registry, visited)
	}
	return nil
}

func avroSampleRecord(v map[string]any, enclosingNS string, registry map[string]any, visited map[string]bool) any {
	// Mark this record as being expanded so self-referential fields short-circuit.
	full := avroFullName(stringField(v, "name"), stringField(v, "namespace"), enclosingNS)
	if full != "" {
		if visited[full] {
			return nil
		}
		visited[full] = true
		defer delete(visited, full)
	}

	ns := stringField(v, "namespace")
	if ns == "" {
		ns = enclosingNS
	}
	out := map[string]any{}
	fields, ok := v["fields"].([]any)
	if !ok {
		return out
	}
	for _, f := range fields {
		fm, ok := f.(map[string]any)
		if !ok {
			continue
		}
		name := stringField(fm, "name")
		if def, has := fm["default"]; has {
			out[name] = def
			continue
		}
		out[name] = avroSample(fm["type"], ns, registry, visited)
	}
	return out
}

func avroSampleEnum(v map[string]any) any {
	syms, ok := v["symbols"].([]any)
	if !ok || len(syms) == 0 {
		return ""
	}
	if def, has := v["default"]; has {
		return def
	}
	return syms[0]
}

func avroSampleLogicalType(lt string) (any, bool) {
	switch lt {
	case "decimal":
		return "0", true
	case "uuid":
		return "00000000-0000-0000-0000-000000000000", true
	case "date", "time-millis", "time-micros", "timestamp-millis", "timestamp-micros":
		return 0, true
	}
	return nil, false
}

// avroBranchKey returns the key Avro JSON encoding uses for a chosen union branch.
func avroBranchKey(branch any, enclosingNS string) string {
	switch v := branch.(type) {
	case string:
		return v
	case map[string]any:
		t := stringField(v, "type")
		// Named types take their fullname.
		if t == avroTypeRecord || t == avroTypeEnum || t == avroTypeFixed {
			return avroFullName(stringField(v, "name"), stringField(v, "namespace"), enclosingNS)
		}
		if t != "" {
			return t
		}
	}
	return "unknown"
}

// --- JSON SCHEMA ----------------------------------------------------------

func collectJSONDefs(root any) map[string]any {
	out := map[string]any{}
	r, ok := root.(map[string]any)
	if !ok {
		return out
	}
	for _, key := range []string{"$defs", "definitions"} {
		if m, ok := r[key].(map[string]any); ok {
			for k, v := range m {
				out[k] = v
			}
		}
	}
	return out
}

// jsonSchemaSample emits a zero-valued sample for a JSON Schema node. visited
// tracks the $ref targets currently being expanded so cyclic `$defs` (e.g. a
// `Node` whose `next` points back at `Node`) don't blow the stack.
func jsonSchemaSample(node any, defs map[string]any, visited map[string]bool) any {
	m, ok := node.(map[string]any)
	if !ok {
		return nil
	}
	if v, ok := resolveJSONRef(m, defs, visited); ok {
		return v
	}
	if v, ok := pickConstOrEnum(m); ok {
		return v
	}
	if def, has := m["default"]; has {
		return def
	}
	if v, ok := pickJSONAlternative(m, defs, visited); ok {
		return v
	}
	return sampleByJSONType(m, defs, visited)
}

// resolveJSONRef handles local `$ref` lookups into `$defs` / `definitions`,
// honors JSON Pointer escaping (`~1` → `/`, `~0` → `~`), and short-circuits
// recursion when a ref is already being expanded.
func resolveJSONRef(m map[string]any, defs map[string]any, visited map[string]bool) (any, bool) {
	ref, ok := m["$ref"].(string)
	if !ok {
		return nil, false
	}
	const p1, p2 = "#/$defs/", "#/definitions/"
	var key string
	switch {
	case strings.HasPrefix(ref, p1):
		key = ref[len(p1):]
	case strings.HasPrefix(ref, p2):
		key = ref[len(p2):]
	default:
		return nil, false
	}
	key = jsonPointerUnescape(key)
	target, ok := defs[key]
	if !ok {
		return nil, false
	}
	if visited[ref] {
		return nil, true
	}
	visited[ref] = true
	defer delete(visited, ref)
	return jsonSchemaSample(target, defs, visited), true
}

func jsonPointerUnescape(token string) string {
	// Per RFC 6901: ~1 → /, ~0 → ~. Order matters.
	token = strings.ReplaceAll(token, "~1", "/")
	token = strings.ReplaceAll(token, "~0", "~")
	return token
}

func pickConstOrEnum(m map[string]any) (any, bool) {
	if c, has := m["const"]; has {
		return c, true
	}
	if enum, has := m["enum"].([]any); has && len(enum) > 0 {
		return enum[0], true
	}
	return nil, false
}

func pickJSONAlternative(m map[string]any, defs map[string]any, visited map[string]bool) (any, bool) {
	for _, key := range []string{"oneOf", "anyOf", "allOf"} {
		alts, ok := m[key].([]any)
		if !ok || len(alts) == 0 {
			continue
		}
		return jsonSchemaSample(alts[0], defs, visited), true
	}
	return nil, false
}

func sampleByJSONType(m map[string]any, defs map[string]any, visited map[string]bool) any {
	switch tt := m["type"].(type) {
	case []any:
		// Type-list union — pick the first non-null type.
		for _, choice := range tt {
			s, ok := choice.(string)
			if !ok || s == jsonTypeNull {
				continue
			}
			return jsonSchemaSample(map[string]any{
				"type":       s,
				"properties": m["properties"],
				"items":      m["items"],
			}, defs, visited)
		}
		return nil
	case string:
		return jsonSchemaZero(tt, m, defs, visited)
	}
	if _, has := m["properties"]; has {
		return jsonSchemaZero(jsonTypeObject, m, defs, visited)
	}
	if _, has := m["items"]; has {
		return jsonSchemaZero(jsonTypeArray, m, defs, visited)
	}
	return nil
}

func jsonSchemaZero(t string, m map[string]any, defs map[string]any, visited map[string]bool) any {
	switch t {
	case jsonTypeObject:
		out := map[string]any{}
		if props, ok := m["properties"].(map[string]any); ok {
			for k, v := range props {
				out[k] = jsonSchemaSample(v, defs, visited)
			}
		}
		return out
	case jsonTypeArray:
		if items, ok := m["items"].(map[string]any); ok {
			return []any{jsonSchemaSample(items, defs, visited)}
		}
		return []any{}
	case jsonTypeString:
		return ""
	case jsonTypeInteger, jsonTypeNumber:
		return 0
	case jsonTypeBool:
		return false
	case jsonTypeNull:
		return nil
	}
	return nil
}
