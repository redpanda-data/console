// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/twmb/franz-go/pkg/kadm"
)

func TestTopicSchemaContext(t *testing.T) {
	tests := []struct {
		name     string
		configs  []kadm.Config
		expected string
	}{
		{name: "nil configs", configs: nil, expected: ""},
		{
			name:     "context not set",
			configs:  []kadm.Config{{Key: "cleanup.policy", Value: new("delete")}},
			expected: "",
		},
		{
			name:     "context set",
			configs:  []kadm.Config{{Key: "redpanda.schema.registry.context", Value: new(".prod")}},
			expected: ".prod",
		},
		{
			name:     "context present without value",
			configs:  []kadm.Config{{Key: "redpanda.schema.registry.context", Value: nil}},
			expected: "",
		},
		{
			name:     "explicit default context",
			configs:  []kadm.Config{{Key: "redpanda.schema.registry.context", Value: new(".")}},
			expected: "",
		},
		{
			name:     "context without leading dot is normalized",
			configs:  []kadm.Config{{Key: "redpanda.schema.registry.context", Value: new("prod")}},
			expected: ".prod",
		},
		{
			name: "context among other configs",
			configs: []kadm.Config{
				{Key: "cleanup.policy", Value: new("delete")},
				{Key: "redpanda.schema.registry.context", Value: new(".staging")},
				{Key: "redpanda.iceberg.mode", Value: new("value_schema_id_prefix")},
			},
			expected: ".staging",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expected, topicSchemaContext(tc.configs))
		})
	}
}
