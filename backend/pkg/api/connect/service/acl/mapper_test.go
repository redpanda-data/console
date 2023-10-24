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
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kmsg"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

func TestAclFilterToKafka(t *testing.T) {
	def := defaulter{}

	emptyDefaultRequest := &v1alpha1.ListACLsRequest{}
	def.applyListACLsRequest(emptyDefaultRequest)

	tests := []struct {
		name      string
		input     *v1alpha1.ACL_Filter
		want      *kmsg.DescribeACLsRequest
		wantError bool
	}{
		{
			name: "basic and complete conversion without error",
			input: &v1alpha1.ACL_Filter{
				Host:                kmsg.StringPtr("localhost"),
				Principal:           kmsg.StringPtr("principal1"),
				ResourceName:        kmsg.StringPtr("resource1"),
				Operation:           v1alpha1.ACL_OPERATION_READ,
				PermissionType:      v1alpha1.ACL_PERMISSION_TYPE_ALLOW,
				ResourcePatternType: v1alpha1.ACL_RESOURCE_PATTERN_TYPE_LITERAL,
				ResourceType:        v1alpha1.ACL_RESOURCE_TYPE_TOPIC,
			},
			want: &kmsg.DescribeACLsRequest{
				Host:                kmsg.StringPtr("localhost"),
				Principal:           kmsg.StringPtr("principal1"),
				ResourceName:        kmsg.StringPtr("resource1"),
				Operation:           kmsg.ACLOperationRead,
				PermissionType:      kmsg.ACLPermissionTypeAllow,
				ResourcePatternType: kmsg.ACLResourcePatternTypeLiteral,
				ResourceType:        kmsg.ACLResourceTypeTopic,
			},
			wantError: false,
		},

		{
			name:  "default input if request doesn't provide any parameters",
			input: emptyDefaultRequest.Filter,
			want: &kmsg.DescribeACLsRequest{
				Operation:           kmsg.ACLOperationAny,
				PermissionType:      kmsg.ACLPermissionTypeAny,
				ResourcePatternType: kmsg.ACLResourcePatternTypeAny,
				ResourceType:        kmsg.ACLResourceTypeAny,
			},
			wantError: false,
		},

		{
			// The defaulter is in charge of setting a default for each enum.
			// The filter function is expected to fail, because the enums
			// will be "UNSPECIFIED" and therefore can't be mapped to a
			// valid Kafka request.
			name: "incomplete conversion",
			input: &v1alpha1.ACL_Filter{
				ResourceType: v1alpha1.ACL_RESOURCE_TYPE_TOPIC,
			},
			want:      nil,
			wantError: true,
		},

		{
			name: "conversion with errors",
			input: &v1alpha1.ACL_Filter{
				ResourceType:        v1alpha1.ACL_RESOURCE_TYPE_TOPIC,
				ResourceName:        kmsg.StringPtr("okay"),
				ResourcePatternType: v1alpha1.ACL_ResourcePatternType(999), // Invalid
			},
			want:      nil,
			wantError: true,
		},
	}

	mapper := &kafkaClientMapper{}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := mapper.aclFilterToKafka(tt.input)
			if tt.wantError {
				assert.Errorf(t, err, "expected an error to be set")
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.want, got)
			}
		})
	}
}

func TestDescribeACLsResourceToProto(t *testing.T) {
	tests := []struct {
		name      string
		input     kmsg.DescribeACLsResponseResource
		want      *v1alpha1.ListACLsResponse_Resource
		wantError bool
	}{
		{
			name: "basic and complete conversion without error",
			input: kmsg.DescribeACLsResponseResource{
				ResourceType:        kmsg.ACLResourceTypeTopic,
				ResourceName:        "test",
				ResourcePatternType: kmsg.ACLResourcePatternTypeMatch,
				ACLs: []kmsg.DescribeACLsResponseResourceACL{
					{
						Principal:      "test-principal",
						Host:           "*",
						Operation:      kmsg.ACLOperationAll,
						PermissionType: kmsg.ACLPermissionTypeAllow,
					},
					{
						Principal:      "another-principal",
						Host:           "*",
						Operation:      kmsg.ACLOperationRead,
						PermissionType: kmsg.ACLPermissionTypeAllow,
					},
				},
			},
			want: &v1alpha1.ListACLsResponse_Resource{
				ResourceType:        v1alpha1.ACL_RESOURCE_TYPE_TOPIC,
				ResourceName:        "test",
				ResourcePatternType: v1alpha1.ACL_RESOURCE_PATTERN_TYPE_MATCH,
				Acls: []*v1alpha1.ListACLsResponse_Policy{
					{
						Principal:      "test-principal",
						Host:           "*",
						Operation:      v1alpha1.ACL_OPERATION_ALL,
						PermissionType: v1alpha1.ACL_PERMISSION_TYPE_ALLOW,
					},
					{
						Principal:      "another-principal",
						Host:           "*",
						Operation:      v1alpha1.ACL_OPERATION_READ,
						PermissionType: v1alpha1.ACL_PERMISSION_TYPE_ALLOW,
					},
				},
			},
			wantError: false,
		},
	}
	mapper := &kafkaClientMapper{}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := mapper.describeACLsResourceToProto(tt.input)
			if tt.wantError {
				assert.Errorf(t, err, "expected an error to be set")
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.want, got)
			}
		})
	}
}

func TestAclOperationToKafka(t *testing.T) {
	tests := []struct {
		name      string
		input     v1alpha1.ACL_Operation
		want      kmsg.ACLOperation
		wantError bool
	}{
		{"any", v1alpha1.ACL_OPERATION_ANY, kmsg.ACLOperationAny, false},
		{"all", v1alpha1.ACL_OPERATION_ALL, kmsg.ACLOperationAll, false},
		{"read", v1alpha1.ACL_OPERATION_READ, kmsg.ACLOperationRead, false},
		{"unknown", v1alpha1.ACL_Operation(9999), kmsg.ACLOperationUnknown, true}, // testing an unknown operation
	}

	mapper := kafkaClientMapper{}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := mapper.aclOperationToKafka(tt.input)
			if tt.wantError {
				assert.Errorf(t, err, "expected an error to be set")
			} else {
				assert.Equal(t, tt.want, got)
			}
		})
	}
}
