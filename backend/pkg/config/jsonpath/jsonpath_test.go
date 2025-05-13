// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package jsonpath

import (
	"encoding/json"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSplitRule(t *testing.T) {
	tests := []struct {
		name         string
		input        string
		expectedPath string
		expectedMap  string
		validateFunc func(t *testing.T, path, mapping string, err error)
	}{
		{
			name:         "basic path without mapping",
			input:        "$.field",
			expectedPath: "$.field",
			expectedMap:  "",
			validateFunc: func(t *testing.T, path, mapping string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, "$.field", path)
				assert.Empty(t, mapping)
			},
		},
		{
			name:         "nested path without mapping",
			input:        "$.field.subfield",
			expectedPath: "$.field.subfield",
			expectedMap:  "",
			validateFunc: func(t *testing.T, path, mapping string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, "$.field.subfield", path)
				assert.Empty(t, mapping)
			},
		},
		{
			name:         "path with mapping",
			input:        "$.field/regex/repl/",
			expectedPath: "$.field",
			expectedMap:  "/regex/repl/",
			validateFunc: func(t *testing.T, path, mapping string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, "$.field", path)
				assert.Equal(t, "/regex/repl/", mapping)
			},
		},
		{
			name:         "path with escaped slash",
			input:        "$.field\\/subfield",
			expectedPath: "$.field\\/subfield",
			expectedMap:  "",
			validateFunc: func(t *testing.T, path, mapping string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, "$.field\\/subfield", path)
				assert.Empty(t, mapping)
			},
		},
		{
			name:         "path with escaped slash and mapping",
			input:        "$.field\\/subfield/regex/repl/",
			expectedPath: "$.field\\/subfield",
			expectedMap:  "/regex/repl/",
			validateFunc: func(t *testing.T, path, mapping string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, "$.field\\/subfield", path)
				assert.Equal(t, "/regex/repl/", mapping)
			},
		},
		{
			name:  "invalid path - no prefix",
			input: "field",
			validateFunc: func(t *testing.T, _, _ string, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "must start with")
			},
		},
		{
			name:  "invalid path - wrong prefix",
			input: "$field",
			validateFunc: func(t *testing.T, _, _ string, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "must start with")
			},
		},
		{
			name:         "path with bracket notation",
			input:        `$["field"]`,
			expectedPath: `$["field"]`,
			expectedMap:  "",
			validateFunc: func(t *testing.T, path, mapping string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, `$["field"]`, path)
				assert.Empty(t, mapping)
			},
		},
		{
			name:         "path with bracket notation and dots",
			input:        `$["field.with.dots"]`,
			expectedPath: `$["field.with.dots"]`,
			expectedMap:  "",
			validateFunc: func(t *testing.T, path, mapping string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, `$["field.with.dots"]`, path)
				assert.Empty(t, mapping)
			},
		},
		{
			name:         "path with bracket notation and mapping",
			input:        `$["field.with.dots"]/regex/repl/`,
			expectedPath: `$["field.with.dots"]`,
			expectedMap:  "/regex/repl/",
			validateFunc: func(t *testing.T, path, mapping string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, `$["field.with.dots"]`, path)
				assert.Equal(t, "/regex/repl/", mapping)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			path, mapping, err := splitRule(tc.input)
			tc.validateFunc(t, path, mapping, err)
		})
	}
}

func TestSplitMappingParts(t *testing.T) {
	tests := []struct {
		name         string
		input        string
		expected     []string
		validateFunc func(t *testing.T, parts []string, err error)
	}{
		{
			name:     "simple two part mapping",
			input:    "/regex/replacement",
			expected: []string{"regex", "replacement"},
			validateFunc: func(t *testing.T, parts []string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []string{"regex", "replacement"}, parts)
			},
		},
		{
			name:     "mapping with flag",
			input:    "/regex/replacement/L",
			expected: []string{"regex", "replacement", "L"},
			validateFunc: func(t *testing.T, parts []string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []string{"regex", "replacement", "L"}, parts)
			},
		},
		{
			name:     "mapping with escaped slashes",
			input:    "/reg\\/ex/re\\/placement",
			expected: []string{"reg/ex", "re/placement"},
			validateFunc: func(t *testing.T, parts []string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []string{"reg/ex", "re/placement"}, parts)
			},
		},
		{
			name:     "mapping with escaped backslashes",
			input:    "/reg\\\\ex/replacement",
			expected: []string{"reg\\ex", "replacement"},
			validateFunc: func(t *testing.T, parts []string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []string{"reg\\ex", "replacement"}, parts)
			},
		},
		{
			name:  "invalid mapping - no leading slash",
			input: "regex/replacement",
			validateFunc: func(t *testing.T, _ []string, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "must start with '/'")
			},
		},
		{
			name:  "invalid mapping - trailing escape",
			input: "/regex\\",
			validateFunc: func(t *testing.T, _ []string, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "invalid escape sequence")
			},
		},
		{
			name:  "empty mapping",
			input: "",
			validateFunc: func(t *testing.T, _ []string, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "must start with '/'")
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			parts, err := splitMappingParts(tc.input)
			tc.validateFunc(t, parts, err)
		})
	}
}

func TestParseMapping(t *testing.T) {
	tests := []struct {
		name         string
		input        string
		validateFunc func(t *testing.T, re *regexp.Regexp, repl string, lower, upper bool, err error)
	}{
		{
			name:  "valid mapping without flags",
			input: "/([^@]+)@.*/replacement",
			validateFunc: func(t *testing.T, re *regexp.Regexp, repl string, lower, upper bool, err error) {
				assert.NoError(t, err)
				assert.NotNil(t, re)
				assert.Equal(t, "replacement", repl)
				assert.False(t, lower)
				assert.False(t, upper)

				// Verify the regex works
				match := re.FindStringSubmatch("user@example.com")
				assert.Equal(t, []string{"user@example.com", "user"}, match)
			},
		},
		{
			name:  "valid mapping with lowercase flag",
			input: "/([^@]+)@.*/replacement/L",
			validateFunc: func(t *testing.T, re *regexp.Regexp, repl string, lower, upper bool, err error) {
				assert.NoError(t, err)
				assert.NotNil(t, re)
				assert.Equal(t, "replacement", repl)
				assert.True(t, lower)
				assert.False(t, upper)
			},
		},
		{
			name:  "valid mapping with uppercase flag",
			input: "/([^@]+)@.*/replacement/U",
			validateFunc: func(t *testing.T, re *regexp.Regexp, repl string, lower, upper bool, err error) {
				assert.NoError(t, err)
				assert.NotNil(t, re)
				assert.Equal(t, "replacement", repl)
				assert.False(t, lower)
				assert.True(t, upper)
			},
		},
		{
			name:  "valid mapping with capture replacement",
			input: "/([^@]+)@.*/$1",
			validateFunc: func(t *testing.T, re *regexp.Regexp, repl string, lower, upper bool, err error) {
				assert.NoError(t, err)
				assert.NotNil(t, re)
				assert.Equal(t, "$1", repl)
				assert.False(t, lower)
				assert.False(t, upper)
			},
		},
		{
			name:  "invalid mapping - no leading slash",
			input: "regex/replacement",
			validateFunc: func(t *testing.T, re *regexp.Regexp, _ string, _, _ bool, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "must start with '/'")
				assert.Nil(t, re)
			},
		},
		{
			name:  "invalid mapping - invalid regex",
			input: "/[unclosed/replacement",
			validateFunc: func(t *testing.T, re *regexp.Regexp, _ string, _, _ bool, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "invalid regex")
				assert.Nil(t, re)
			},
		},
		{
			name:  "invalid mapping - missing parts",
			input: "/regex",
			validateFunc: func(t *testing.T, re *regexp.Regexp, _ string, _, _ bool, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "mapping requires pattern and replacement")
				assert.Nil(t, re)
			},
		},
		{
			name:  "invalid mapping - unknown flag",
			input: "/regex/replacement/X",
			validateFunc: func(t *testing.T, re *regexp.Regexp, _ string, _, _ bool, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "unknown flag")
				assert.Nil(t, re)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			re, repl, lower, upper, err := parseMapping(tc.input)
			tc.validateFunc(t, re, repl, lower, upper, err)
		})
	}
}

func TestMappedJSONPath_UnmarshalText(t *testing.T) {
	tests := []struct {
		name         string
		input        string
		validateFunc func(t *testing.T, m *MappedJSONPath, err error)
	}{
		{
			name:  "valid path without mapping",
			input: "$.field",
			validateFunc: func(t *testing.T, m *MappedJSONPath, err error) {
				assert.NoError(t, err)
				assert.Equal(t, "$.field", m.raw)
				assert.NotNil(t, m.exp)
				assert.False(t, m.hasMapping)
			},
		},
		{
			name:  "valid path with mapping",
			input: "$.field/([^@]+)@.*/$1/L",
			validateFunc: func(t *testing.T, m *MappedJSONPath, err error) {
				assert.NoError(t, err)
				assert.Equal(t, "$.field/([^@]+)@.*/$1/L", m.raw)
				assert.NotNil(t, m.exp)
				assert.True(t, m.hasMapping)
				assert.NotNil(t, m.re)
				assert.Equal(t, "$1", m.repl)
				assert.True(t, m.lower)
				assert.False(t, m.upper)
			},
		},
		{
			name:  "invalid path",
			input: "field",
			validateFunc: func(t *testing.T, _ *MappedJSONPath, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "must start with")
			},
		},
		{
			name:  "invalid JSONPath",
			input: "$.[invalid",
			validateFunc: func(t *testing.T, _ *MappedJSONPath, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "invalid JSONPath")
			},
		},
		{
			name:  "invalid mapping",
			input: "$.field/[unclosed/replacement",
			validateFunc: func(t *testing.T, _ *MappedJSONPath, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "invalid mapping")
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var m MappedJSONPath
			err := m.UnmarshalText([]byte(tc.input))
			tc.validateFunc(t, &m, err)
		})
	}
}

func TestMappedJSONPath_MarshalText(t *testing.T) {
	tests := []struct {
		name         string
		mappedPath   MappedJSONPath
		validateFunc func(t *testing.T, text []byte, err error)
	}{
		{
			name: "marshal path without mapping",
			mappedPath: MappedJSONPath{
				raw: "$.field",
			},
			validateFunc: func(t *testing.T, text []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, "$.field", string(text))
			},
		},
		{
			name: "marshal path with mapping",
			mappedPath: MappedJSONPath{
				raw: "$.field/regex/repl/L",
			},
			validateFunc: func(t *testing.T, text []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, "$.field/regex/repl/L", string(text))
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			text, err := tc.mappedPath.MarshalText()
			tc.validateFunc(t, text, err)
		})
	}
}

func TestMappedJSONPath_Eval(t *testing.T) {
	tests := []struct {
		name         string
		rule         string
		doc          string
		validateFunc func(t *testing.T, result []string)
	}{
		{
			name: "simple path extraction",
			rule: "$.sub",
			doc:  `{"sub": "user", "other": "value"}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"user"}, result)
			},
		},
		{
			name: "nested path extraction",
			rule: "$.user_info.email",
			doc:  `{"sub": "user", "user_info": {"name": "User", "email": "user@example.com"}}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"user@example.com"}, result)
			},
		},
		{
			name: "path with mapping - extract username from email",
			rule: "$.user_info.email/([^@]+)@.*/$1",
			doc:  `{"sub": "user", "user_info": {"name": "User", "email": "user@example.com"}}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"user"}, result)
			},
		},
		{
			name: "path with mapping and lowercase",
			rule: "$.user_info.email/([^@]+)@.*/$1/L",
			doc:  `{"sub": "user", "user_info": {"name": "User", "email": "USER@example.com"}}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"user"}, result)
			},
		},
		{
			name: "path with mapping and uppercase",
			rule: "$.user_info.email/([^@]+)@.*/$1/U",
			doc:  `{"sub": "user", "user_info": {"name": "User", "email": "user@example.com"}}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"USER"}, result)
			},
		},
		{
			name: "path with domain validation - matching domain",
			rule: "$.user_info.email/([^@]+)@example\\.com/$1/L",
			doc:  `{"sub": "user", "user_info": {"name": "User", "email": "user@example.com"}}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"user"}, result)
			},
		},
		{
			name: "path with domain validation - non-matching domain",
			rule: "$.user_info.email/([^@]+)@example\\.com/$1/L",
			doc:  `{"sub": "user", "user_info": {"name": "User", "email": "user@other.com"}}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Empty(t, result)
			},
		},
		{
			name: "path with non-string value",
			rule: "$.age",
			doc:  `{"sub": "user", "age": 30}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Empty(t, result)
			},
		},
		{
			name: "multiple matches",
			rule: "$.emails[*]",
			doc:  `{"sub": "user", "emails": ["user@example.com", "user@other.com"]}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"user@example.com", "user@other.com"}, result)
			},
		},
		{
			name: "multiple matches with mapping",
			rule: "$.emails[*]/([^@]+)@.*/$1",
			doc:  `{"sub": "user", "emails": ["user1@example.com", "user2@other.com"]}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"user1", "user2"}, result)
			},
		},
		{
			name: "path not found",
			rule: "$.missing",
			doc:  `{"sub": "user", "user_info": {"name": "User"}}`,
			validateFunc: func(t *testing.T, result []string) {
				assert.Empty(t, result)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var m MappedJSONPath
			err := m.UnmarshalText([]byte(tc.rule))
			require.NoError(t, err, "Failed to unmarshal rule")

			var doc any
			err = json.Unmarshal([]byte(tc.doc), &doc)
			require.NoError(t, err, "Failed to unmarshal document")

			result := m.Eval(doc)
			tc.validateFunc(t, result)
		})
	}
}

func TestMappedJSONPath_E2E_WithRealWorldExamples(t *testing.T) {
	// Example from the documentation
	jwtPayload := `{
		"sub": "user",
		"user_info": {
			"name": "User",
			"email": "user@example.com"
		}
	}`

	tests := []struct {
		name         string
		rule         string
		validateFunc func(t *testing.T, result []string)
	}{
		{
			name: "default rule",
			rule: "$.sub",
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"user"}, result)
			},
		},
		{
			name: "extract from email",
			rule: "$.user_info.email/([^@]+)@.*/$1/L",
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"user"}, result)
			},
		},
		{
			name: "extract with domain validation",
			rule: "$.user_info.email/([^@]+)@example\\.com/$1/L",
			validateFunc: func(t *testing.T, result []string) {
				assert.Equal(t, []string{"user"}, result)
			},
		},
	}

	var doc any
	err := json.Unmarshal([]byte(jwtPayload), &doc)
	require.NoError(t, err, "Failed to unmarshal JWT payload")

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var m MappedJSONPath
			err := m.UnmarshalText([]byte(tc.rule))
			require.NoError(t, err, "Failed to unmarshal rule")

			result := m.Eval(doc)
			tc.validateFunc(t, result)
		})
	}
}

func TestMappedJSONPath_E2E_EdgeCases(t *testing.T) {
	tests := []struct {
		name         string
		rule         string
		doc          string
		validateFunc func(t *testing.T, result []string, err error)
	}{
		{
			name: "path with dots in field name",
			rule: `$["field.with.dots"]`, // Using bracket notation instead of escaped dots
			doc:  `{"field.with.dots": "value"}`,
			validateFunc: func(t *testing.T, result []string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []string{"value"}, result)
			},
		},
		{
			name: "complex nested array path",
			rule: `$.users[*].contacts[?(@.type=="email")].value`,
			doc:  `{"users":[{"name":"User1","contacts":[{"type":"email","value":"user1@example.com"},{"type":"phone","value":"123456"}]},{"name":"User2","contacts":[{"type":"email","value":"user2@example.com"}]}]}`,
			validateFunc: func(t *testing.T, result []string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []string{"user1@example.com", "user2@example.com"}, result)
			},
		},
		{
			name: "empty JSON document",
			rule: "$.field",
			doc:  `{}`,
			validateFunc: func(t *testing.T, result []string, err error) {
				assert.NoError(t, err)
				assert.Empty(t, result)
			},
		},
		{
			name: "empty rule",
			rule: "",
			doc:  `{"email": "user+alias@example.com"}`,
			validateFunc: func(t *testing.T, result []string, err error) {
				require.Error(t, err)
				assert.ErrorContains(t, err, "empty string is not a valid JSON path")
				assert.Empty(t, result)
			},
		},
		{
			name: "null JSON value",
			rule: "$.nullable",
			doc:  `{"nullable": null}`,
			validateFunc: func(t *testing.T, result []string, err error) {
				assert.NoError(t, err)
				assert.Empty(t, result)
			},
		},
		{
			name: "mapping with special regex characters",
			rule: `$.email/([^@]+)@.*/$1/L`,
			doc:  `{"email": "user+alias@example.com"}`,
			validateFunc: func(t *testing.T, result []string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []string{"user+alias"}, result)
			},
		},
		{
			name: "regex with plus character as literal",
			rule: `$.email/user\\+([^@]+)@.*/$1/L`,
			doc:  `{"email": "user+alias@example.com"}`,
			validateFunc: func(t *testing.T, result []string, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []string{"alias"}, result)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m, err := NewMappedJSONPath(tc.rule)

			var doc any
			if err == nil {
				err = json.Unmarshal([]byte(tc.doc), &doc)
				require.NoError(t, err, "Failed to unmarshal document")

				result := m.Eval(doc)
				tc.validateFunc(t, result, err)
			} else {
				tc.validateFunc(t, nil, err)
			}
		})
	}
}
