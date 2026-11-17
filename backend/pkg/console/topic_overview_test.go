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

func TestTopicActionsFromOperations(t *testing.T) {
	tests := []struct {
		name     string
		ops      []kadm.ACLOperation
		expected []string
	}{
		{
			name:     "operations not reported",
			ops:      nil,
			expected: nil,
		},
		{
			name:     "describe only",
			ops:      []kadm.ACLOperation{kadm.OpDescribe, kadm.OpDescribeConfigs},
			expected: []string{topicActionSeeTopic, topicActionViewPartitions, topicActionViewConsumers, topicActionViewConfig},
		},
		{
			name: "read without config access",
			ops:  []kadm.ACLOperation{kadm.OpRead, kadm.OpDescribe},
			expected: []string{
				topicActionSeeTopic, topicActionViewPartitions, topicActionViewConsumers,
				topicActionViewMessages, topicActionUseSearchFilter,
			},
		},
		{
			name: "every mapped operation",
			ops: []kadm.ACLOperation{
				kadm.OpRead, kadm.OpWrite, kadm.OpCreate, kadm.OpDelete, kadm.OpAlter,
				kadm.OpDescribe, kadm.OpDescribeConfigs, kadm.OpAlterConfigs,
			},
			expected: []string{topicActionAll},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expected, topicActionsFromOperations(tc.ops))
		})
	}
}
