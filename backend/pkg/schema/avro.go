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
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strings"
)

// stripArrayAndMapNames removes the "name" attribute from array and map
// schemas. The Avro spec only defines names for named types and Java ignores
// a name anywhere else, but twmb/avro rejects it
// (https://github.com/twmb/avro/issues/66). Schemas twmb/avro already accepts
// are returned unchanged.
func stripArrayAndMapNames(schema string) string {
	dec := json.NewDecoder(strings.NewReader(schema))
	dec.UseNumber()
	var root any
	if err := dec.Decode(&root); err != nil {
		return schema
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return schema
	}
	if !stripNamesInSchema(root) {
		return schema
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(root); err != nil {
		return schema
	}
	return strings.TrimSuffix(buf.String(), "\n")
}

// stripNamesInSchema only descends into schema positions. Field defaults are
// data and are never touched, even when they look like a schema.
func stripNamesInSchema(node any) bool {
	switch n := node.(type) {
	case []any:
		changed := false
		for _, branch := range n {
			changed = stripNamesInSchema(branch) || changed
		}
		return changed
	case map[string]any:
		switch n["type"] {
		case "array":
			removed := deleteNonEmptyName(n)
			return stripNamesInSchema(n["items"]) || removed
		case "map":
			removed := deleteNonEmptyName(n)
			return stripNamesInSchema(n["values"]) || removed
		case "record", "error":
			fields, ok := n["fields"].([]any)
			if !ok {
				return false
			}
			changed := false
			for _, f := range fields {
				if field, ok := f.(map[string]any); ok {
					changed = stripNamesInSchema(field["type"]) || changed
				}
			}
			return changed
		}
	}
	return false
}

// deleteNonEmptyName leaves empty names alone because twmb/avro accepts them.
func deleteNonEmptyName(n map[string]any) bool {
	if name, ok := n["name"].(string); ok && name != "" {
		delete(n, "name")
		return true
	}
	return false
}
