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
type SchemaType int

const (
	TypeAvro SchemaType = iota
	TypeProtobuf
	TypeJSON
)

// String presentation of schema type.
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
	case "", "AVRO":
		*t = TypeAvro
	case "PROTOBUF":
		*t = TypeProtobuf
	case "JSON":
		*t = TypeJSON
	}
	return nil
}
