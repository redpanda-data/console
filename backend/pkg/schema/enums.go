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

	"github.com/twmb/franz-go/pkg/sr"
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

// CompatibilityLevel as an enum representing config compatibility levels.
type CompatibilityLevel int

const (
	// CompatDefault is the compatibility that is returned if no compatibility is set.
	// This can only be set for subjects.
	CompatDefault CompatibilityLevel = iota + 1
	// CompatNone represents compatibility "NONE".
	CompatNone
	// CompatBackward represents compatibility "BACKWARD".
	CompatBackward
	// CompatBackwardTransitive represents compatibility "BACKWARD_TRANSITIVE".
	CompatBackwardTransitive
	// CompatForward represents compatibility "FORWARD".
	CompatForward
	// CompatForwardTransitive represents compatibility "FORWARD_TRANSITIVE".
	CompatForwardTransitive
	// CompatFull represents compatibility "FULL".
	CompatFull
	// CompatFullTransitive represents compatibility "FULL_TRANSITIVE".
	CompatFullTransitive
)

// String presentation of the compatibility level.
func (l CompatibilityLevel) String() string {
	switch l {
	case CompatDefault:
		return "DEFAULT"
	case CompatNone:
		return "NONE"
	case CompatBackward:
		return "BACKWARD"
	case CompatBackwardTransitive:
		return "BACKWARD_TRANSITIVE"
	case CompatForward:
		return "FORWARD"
	case CompatForwardTransitive:
		return "FORWARD_TRANSITIVE"
	case CompatFull:
		return "FULL"
	case CompatFullTransitive:
		return "FULL_TRANSITIVE"
	default:
		return ""
	}
}

// FromSRCompatibilityLevel creates CompatibilityLevel from franz-go one
func FromSRCompatibilityLevel(l sr.CompatibilityLevel) CompatibilityLevel {
	switch l {
	// TODO Default?
	// case sr.CompatBackward:
	// 	return "DEFAULT"
	case sr.CompatNone:
		return CompatNone
	case sr.CompatBackward:
		return CompatBackward
	case sr.CompatBackwardTransitive:
		return CompatBackwardTransitive
	case sr.CompatForward:
		return CompatForward
	case sr.CompatForwardTransitive:
		return CompatForwardTransitive
	case sr.CompatFull:
		return CompatFull
	case sr.CompatFullTransitive:
		return CompatFullTransitive
	default:
		return CompatNone
	}
}

// MarshalText marshals the compatibility level.
func (l CompatibilityLevel) MarshalText() ([]byte, error) {
	s := l.String()
	if s == "" {
		return nil, fmt.Errorf("unknown compatibility level %d", l)
	}
	return []byte(s), nil
}

// UnmarshalText unmarshals the compatibility level.
func (l *CompatibilityLevel) UnmarshalText(text []byte) error {
	switch s := strings.ToUpper(string(text)); s {
	default:
		return fmt.Errorf("unknown compatibility level %q", s)
	case "DEFAULT":
		*l = CompatDefault
	case "NONE":
		*l = CompatNone
	case "BACKWARD":
		*l = CompatBackward
	case "BACKWARD_TRANSITIVE":
		*l = CompatBackwardTransitive
	case "FORWARD":
		*l = CompatForward
	case "FORWARD_TRANSITIVE":
		*l = CompatForwardTransitive
	case "FULL":
		*l = CompatFull
	case "FULL_TRANSITIVE":
		*l = CompatFullTransitive
	}
	return nil
}
