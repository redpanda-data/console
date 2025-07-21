// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package jsonpath implements JSONPath or JSONPath-similar types that can be
// used in configs.
package jsonpath

import (
	"encoding"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/ohler55/ojg/jp"
)

// Interface assertions.
var (
	_ encoding.TextUnmarshaler = (*MappedJSONPath)(nil)
	_ encoding.TextMarshaler   = (*MappedJSONPath)(nil)
)

// MappedJSONPath is a custom type that combines JSONPath expressions with regex-based
// transformations to extract and manipulate data from JSON documents. It's particularly
// useful for extracting and transforming identifiers from structured data like JWT tokens.
// Features:
//
// 1. JSONPath Extraction: Use standard JSONPath syntax to query JSON documents
// 2. Regex Filtering: Filter string results through regex patterns
// 3. Regex Capture and Replacement: Transform extracted strings with regex capture groups
// 4. Case Transformation: Apply uppercase or lowercase transformations to results
//
// - The path (segments) is evaluated with ojg/jp.
// - If the optional mapping is present, each string result is:
//  1. filtered through the regex (non-matches are discarded),
//  2. replaced using $-captures,
//  3. lower-cased (flag 'L') or upper-cased (flag 'U').
//
// This JSON Path type is generic, any subsystem can embed it wherever a
// JSONPath and optional regex-transform is useful.
//
// Example:
//   - "$.user_info.email/([^@]+)@.*/$1/L" - Extract username from email and lowercase it
type MappedJSONPath struct {
	raw string  // original rule text, preserved for logging and round-tripping
	exp jp.Expr // compiled JSONPath expression

	// mapping section (set only when rule contains “/regex/…”)
	hasMapping bool
	re         *regexp.Regexp
	repl       string
	lower      bool
	upper      bool
}

// NewMappedJSONPath creates a new MappedJSONPath from a string rule.
// It returns an error if the rule is invalid.
//
// Example:
// path, err := NewMappedJSONPath("$.user_info.email/([^@]+)@.*/$1/L")
func NewMappedJSONPath(rule string) (MappedJSONPath, error) {
	var m MappedJSONPath
	if err := m.UnmarshalText([]byte(rule)); err != nil {
		return MappedJSONPath{}, err
	}
	return m, nil
}

// MustNewMappedJSONPath creates a new MappedJSONPath from a string rule.
// It panics if the rule is invalid.
//
// Example:
// path := MustNewMappedJSONPath("$.user_info.email/([^@]+)@.*/$1/L")
func MustNewMappedJSONPath(rule string) MappedJSONPath {
	m, err := NewMappedJSONPath(rule)
	if err != nil {
		panic(err)
	}
	return m
}

// UnmarshalText parses a rule from configuration data.
func (m *MappedJSONPath) UnmarshalText(b []byte) error {
	if len(b) == 0 {
		return errors.New("empty string is not a valid JSON path")
	}

	m.raw = string(b)

	pathPart, mapPart, err := splitRule(m.raw)
	if err != nil {
		return err
	}

	exp, err := jp.Parse([]byte(pathPart))
	if err != nil {
		return fmt.Errorf("invalid JSONPath: %w", err)
	}
	m.exp = exp

	if mapPart != "" {
		re, repl, lower, upper, err := parseMapping(mapPart)
		if err != nil {
			return fmt.Errorf("invalid mapping %q: %w", mapPart, err)
		}
		m.hasMapping, m.re, m.repl, m.lower, m.upper = true, re, repl, lower, upper
	}
	return nil
}

// MarshalText returns the original rule text.
func (m MappedJSONPath) MarshalText() ([]byte, error) { return []byte(m.raw), nil }

// Eval applies the rule to a JSON document.
//
// Non-string matches are skipped; values that fail the regex (when present)
// are discarded.
func (m MappedJSONPath) Eval(doc any) []string {
	raw := m.exp.Get(doc)
	out := make([]string, 0, len(raw))

	for _, v := range raw {
		s, ok := v.(string)
		if !ok {
			continue
		}

		if m.hasMapping {
			if !m.re.MatchString(s) {
				continue
			}
			s = m.re.ReplaceAllString(s, m.repl)
			switch {
			case m.lower:
				s = strings.ToLower(s)
			case m.upper:
				s = strings.ToUpper(s)
			}
		}
		out = append(out, s)
	}
	return out
}

// String returns the original rule text.
func (m MappedJSONPath) String() string {
	return m.raw
}

// splitRule divides the rule into the pure-JSONPath part and the mapping suffix.
// It scans for the first unescaped slash. If none is found, the mapping part is
// empty.
func splitRule(s string) (jsonPath string, regexMapping string, err error) {
	if !strings.HasPrefix(s, "$") {
		return "", "", errors.New(`rule must start with "$"`)
	}

	// Allow either dot notation ($.field) or bracket notation ($["field"])
	if !strings.HasPrefix(s, "$.") && !strings.HasPrefix(s, "$[") {
		return "", "", errors.New(`rule must start with "$." or "$["`)
	}

	escape := false
	for i, r := range s {
		switch {
		case escape:
			escape = false
		case r == '\\':
			escape = true
		case r == '/':
			return s[:i], s[i:], nil // path, mapping
		}
	}
	return s, "", nil // entire string is the path
}

// parseMapping validates and decomposes a mapping suffix of the form
// "/regex/replacement/flags".
//
// Escaped slashes (`\/`) and backslashes (`\\`) inside `regex` and
// "replacement" are honored.
//
// Return values are:
//
// 1. compiled regular expression (`*regexp.Regexp`)
// 2. replacement string (after unescaping)
// 3. `true` if the `L` flag is present, force lower-case
// 4. `true` if the `U` flag is present, force upper-case
// 5. error, if any component is syntactically invalid
func parseMapping(m string) (expr *regexp.Regexp, replacementString string, isLower bool, isUpper bool, err error) {
	if m == "" || m[0] != '/' {
		return nil, "", false, false, errors.New("mapping must start with '/'")
	}

	parts, err := splitMappingParts(m)
	if err != nil {
		return nil, "", false, false, err
	}

	if len(parts) < 2 || len(parts) > 3 {
		return nil, "", false, false, fmt.Errorf("mapping requires pattern and replacement, got %d parts", len(parts))
	}

	pattern := parts[0]
	replacement := parts[1]

	// Process flags if present
	var lower, upper bool
	if len(parts) == 3 {
		switch parts[2] {
		case "L":
			lower = true
		case "U":
			upper = true
		default:
			return nil, "", false, false, fmt.Errorf("unknown flag %q, expected 'L' or 'U'", parts[2])
		}
	}

	// Compile the regex
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, "", false, false, fmt.Errorf("invalid regex %q: %w", pattern, err)
	}

	return re, replacement, lower, upper, nil
}

// splitMappingParts splits a mapping string by unescaped '/' delimiters.
// For example: "/abc\/def/ghi/L" -> ["abc\/def", "ghi", "L"]
func splitMappingParts(s string) ([]string, error) {
	if s == "" || s[0] != '/' {
		return nil, errors.New("mapping must start with '/'")
	}

	var parts []string
	var current strings.Builder

	// Skip the leading '/'
	s = s[1:]

	escape := false
	for i := 0; i < len(s); i++ {
		c := s[i]

		if escape {
			current.WriteByte(c)
			escape = false
			continue
		}

		if c == '\\' {
			escape = true
			continue
		}

		if c == '/' {
			parts = append(parts, current.String())
			current.Reset()
			continue
		}

		current.WriteByte(c)
	}

	// Add the last part if there's content
	if current.Len() > 0 {
		parts = append(parts, current.String())
	}

	if escape {
		return nil, errors.New("invalid escape sequence at end of string")
	}

	return parts, nil
}
