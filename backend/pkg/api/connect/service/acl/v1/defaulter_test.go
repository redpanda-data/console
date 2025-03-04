// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package acl

import (
	"testing"

	"github.com/stretchr/testify/assert"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func TestApplyListACLsRequest(t *testing.T) {
	tests := []struct {
		name     string
		input    *v1.ListACLsRequest
		expected *v1.ListACLsRequest
	}{
		{
			name:     "nil filter",
			input:    &v1.ListACLsRequest{},
			expected: &v1.ListACLsRequest{Filter: &v1.ListACLsRequest_Filter{ResourceType: v1.ACL_RESOURCE_TYPE_ANY, ResourcePatternType: v1.ACL_RESOURCE_PATTERN_TYPE_ANY, Operation: v1.ACL_OPERATION_ANY, PermissionType: v1.ACL_PERMISSION_TYPE_ANY}},
		},
		{
			name:     "unspecified values",
			input:    &v1.ListACLsRequest{Filter: &v1.ListACLsRequest_Filter{}},
			expected: &v1.ListACLsRequest{Filter: &v1.ListACLsRequest_Filter{ResourceType: v1.ACL_RESOURCE_TYPE_ANY, ResourcePatternType: v1.ACL_RESOURCE_PATTERN_TYPE_ANY, Operation: v1.ACL_OPERATION_ANY, PermissionType: v1.ACL_PERMISSION_TYPE_ANY}},
		},
		{
			name:     "partially specified values",
			input:    &v1.ListACLsRequest{Filter: &v1.ListACLsRequest_Filter{Operation: v1.ACL_OPERATION_CREATE}},
			expected: &v1.ListACLsRequest{Filter: &v1.ListACLsRequest_Filter{ResourceType: v1.ACL_RESOURCE_TYPE_ANY, ResourcePatternType: v1.ACL_RESOURCE_PATTERN_TYPE_ANY, Operation: v1.ACL_OPERATION_CREATE, PermissionType: v1.ACL_PERMISSION_TYPE_ANY}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := &defaulter{}
			d.applyListACLsRequest(tt.input)
			assert.Equal(t, tt.expected, tt.input)
		})
	}
}
