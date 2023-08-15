// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schema

import (
	"fmt"
	"strings"
)

// SchemaType as an enum representing schema types. The default schema type
// is avro.
//
//nolint:revive // Just Type as name would be too generic.
type SchemaType int

const (
	// TypeAvro represents the type for Avro schemas.
	TypeAvro SchemaType = iota
	// TypeProtobuf represents the type for Protobuf schemas.
	TypeProtobuf
	// TypeJSON represents the type for JSON schemas.
	TypeJSON
)

// String presentation of schema type. The strings must not be changed as they are used
// for unmarshalling as well as comparisons.
func (t SchemaType) String() string {
	switch t {
	case TypeAvro:
		return "AVRO"
	case TypeProtobuf:
		return "PROTOBUF"
	case TypeJSON:
		return "JSON"
	default:
		return ""
	}
}

// MarshalText marshals the SchemaType.
func (t SchemaType) MarshalText() ([]byte, error) {
	s := t.String()
	if s == "" {
		return nil, fmt.Errorf("unknown schema type %d", t)
	}
	return []byte(s), nil
}

// UnmarshalText unmarshals the schema type.
func (t *SchemaType) UnmarshalText(text []byte) error {
	switch s := strings.ToUpper(string(text)); s {
	default:
		return fmt.Errorf("unknown schema type %q", s)
	case "", TypeAvro.String():
		*t = TypeAvro
	case TypeProtobuf.String():
		*t = TypeProtobuf
	case TypeJSON.String():
		*t = TypeJSON
	}
	return nil
}
