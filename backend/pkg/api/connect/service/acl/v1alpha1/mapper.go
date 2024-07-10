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
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

type apiVersionMapper struct{}

func (*apiVersionMapper) v1alpha1ToListACLsv1alpha2(r *v1alpha1.ListACLsRequest) *v1alpha2.ListACLsRequest {
	resourceName := r.GetFilter().ResourceName
	principal := r.GetFilter().Principal
	host := r.GetFilter().Host

	var filter *v1alpha2.ListACLsRequest_Filter

	if r.Filter != nil {
		filter = &v1alpha2.ListACLsRequest_Filter{
			ResourceType:        ResourceTypeV1Alpha1ToV1Alpha2(r.GetFilter().GetResourceType()),
			ResourceName:        resourceName,
			ResourcePatternType: ResourcePatternTypeV1Alpha1ToV1Alpha2(r.GetFilter().GetResourcePatternType()),
			Principal:           principal,
			Host:                host,
			Operation:           OperationV1Alpha1ToV1Alpha2(r.GetFilter().GetOperation()),
			PermissionType:      PermissionTypeV1Alpha1ToV1Alpha2(r.GetFilter().GetPermissionType()),
		}
	}

	return &v1alpha2.ListACLsRequest{
		Filter: filter,
	}
}

func (*apiVersionMapper) v1alpha2ListACLsResponseResourcesTov1alpha1(resources []*v1alpha2.ListACLsResponse_Resource) []*v1alpha1.ListACLsResponse_Resource {
	out := make([]*v1alpha1.ListACLsResponse_Resource, 0, len(resources))

	for _, r := range resources {
		acls := r.GetAcls()
		policies := make([]*v1alpha1.ListACLsResponse_Policy, 0, len(acls))
		for _, acl := range acls {
			policies = append(policies, &v1alpha1.ListACLsResponse_Policy{
				Principal:      acl.GetPrincipal(),
				Host:           acl.GetHost(),
				Operation:      OperationV1Alpha2ToV1Alpha1(acl.GetOperation()),
				PermissionType: PermissionTypeV1Alpha2ToV1Alpha1(acl.GetPermissionType()),
			})
		}
		or := &v1alpha1.ListACLsResponse_Resource{
			ResourceType:        ResourceTypeV1Alpha2ToV1Alpha1(r.GetResourceType()),
			ResourceName:        r.GetResourceName(),
			ResourcePatternType: ResourcePatternTypeV1Alpha2ToV1Alpha1(r.GetResourcePatternType()),
			Acls:                policies,
		}
		out = append(out, or)
	}

	return out
}

func (*apiVersionMapper) v1alpha1ToCreateACLv1alpha2(r *v1alpha1.CreateACLRequest) *v1alpha2.CreateACLRequest {
	return &v1alpha2.CreateACLRequest{
		ResourcePatternType: ResourcePatternTypeV1Alpha1ToV1Alpha2(r.GetResourcePatternType()),
		ResourceType:        ResourceTypeV1Alpha1ToV1Alpha2(r.GetResourceType()),
		ResourceName:        r.GetResourceName(),
		Principal:           r.GetPrincipal(),
		Host:                r.GetHost(),
		Operation:           OperationV1Alpha1ToV1Alpha2(r.GetOperation()),
		PermissionType:      PermissionTypeV1Alpha1ToV1Alpha2(r.GetPermissionType()),
	}
}

func (*apiVersionMapper) v1alpha1ToDeleteACLv1alpha2(r *v1alpha1.DeleteACLsRequest) *v1alpha2.DeleteACLsRequest {
	resourceName := r.GetFilter().ResourceName
	principal := r.GetFilter().Principal
	host := r.GetFilter().Host

	return &v1alpha2.DeleteACLsRequest{
		Filter: &v1alpha2.DeleteACLsRequest_Filter{
			ResourceType:        ResourceTypeV1Alpha1ToV1Alpha2(r.GetFilter().GetResourceType()),
			ResourceName:        resourceName,
			ResourcePatternType: ResourcePatternTypeV1Alpha1ToV1Alpha2(r.GetFilter().GetResourcePatternType()),
			Principal:           principal,
			Host:                host,
			Operation:           OperationV1Alpha1ToV1Alpha2(r.GetFilter().GetOperation()),
			PermissionType:      PermissionTypeV1Alpha1ToV1Alpha2(r.GetFilter().GetPermissionType()),
		},
	}
}

func (*apiVersionMapper) v1alpha2ToDeleteACLsResponseMatchingACLv1alpha1(acls []*v1alpha2.DeleteACLsResponse_MatchingACL) []*v1alpha1.DeleteACLsResponse_MatchingACL {
	out := make([]*v1alpha1.DeleteACLsResponse_MatchingACL, 0, len(acls))

	for _, acl := range acls {
		out = append(out, &v1alpha1.DeleteACLsResponse_MatchingACL{
			ResourceType:        ResourceTypeV1Alpha2ToV1Alpha1(acl.GetResourceType()),
			ResourceName:        acl.GetResourceName(),
			ResourcePatternType: ResourcePatternTypeV1Alpha2ToV1Alpha1(acl.GetResourcePatternType()),
			Principal:           acl.GetPrincipal(),
			Host:                acl.GetHost(),
			Operation:           OperationV1Alpha2ToV1Alpha1(acl.GetOperation()),
			PermissionType:      PermissionTypeV1Alpha2ToV1Alpha1(acl.GetPermissionType()),
			Error:               acl.GetError(),
		})
	}

	return out
}

// ResourceTypeV1Alpha1ToV1Alpha2 converts ACL Resource Type enum from v1alpha1 to v1alpha2.
func ResourceTypeV1Alpha1ToV1Alpha2(t v1alpha1.ACL_ResourceType) v1alpha2.ACL_ResourceType {
	switch t {
	case v1alpha1.ACL_RESOURCE_TYPE_ANY:
		return v1alpha2.ACL_RESOURCE_TYPE_ANY
	case v1alpha1.ACL_RESOURCE_TYPE_TOPIC:
		return v1alpha2.ACL_RESOURCE_TYPE_TOPIC
	case v1alpha1.ACL_RESOURCE_TYPE_GROUP:
		return v1alpha2.ACL_RESOURCE_TYPE_GROUP
	case v1alpha1.ACL_RESOURCE_TYPE_CLUSTER:
		return v1alpha2.ACL_RESOURCE_TYPE_CLUSTER
	case v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID:
		return v1alpha2.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID
	case v1alpha1.ACL_RESOURCE_TYPE_DELEGATION_TOKEN:
		return v1alpha2.ACL_RESOURCE_TYPE_DELEGATION_TOKEN
	case v1alpha1.ACL_RESOURCE_TYPE_USER:
		return v1alpha2.ACL_RESOURCE_TYPE_USER
	default:
		return v1alpha2.ACL_RESOURCE_TYPE_UNSPECIFIED
	}
}

// OperationV1Alpha1ToV1Alpha2 converts ACL Operation enum from v1alpha1 to v1alpha2.
func OperationV1Alpha1ToV1Alpha2(t v1alpha1.ACL_Operation) v1alpha2.ACL_Operation {
	switch t {
	case v1alpha1.ACL_OPERATION_ANY:
		return v1alpha2.ACL_OPERATION_ANY
	case v1alpha1.ACL_OPERATION_ALL:
		return v1alpha2.ACL_OPERATION_ALL
	case v1alpha1.ACL_OPERATION_READ:
		return v1alpha2.ACL_OPERATION_READ
	case v1alpha1.ACL_OPERATION_WRITE:
		return v1alpha2.ACL_OPERATION_WRITE
	case v1alpha1.ACL_OPERATION_CREATE:
		return v1alpha2.ACL_OPERATION_CREATE
	case v1alpha1.ACL_OPERATION_DELETE:
		return v1alpha2.ACL_OPERATION_DELETE
	case v1alpha1.ACL_OPERATION_ALTER:
		return v1alpha2.ACL_OPERATION_ALTER
	case v1alpha1.ACL_OPERATION_DESCRIBE:
		return v1alpha2.ACL_OPERATION_DESCRIBE
	case v1alpha1.ACL_OPERATION_CLUSTER_ACTION:
		return v1alpha2.ACL_OPERATION_CLUSTER_ACTION
	case v1alpha1.ACL_OPERATION_DESCRIBE_CONFIGS:
		return v1alpha2.ACL_OPERATION_DESCRIBE_CONFIGS
	case v1alpha1.ACL_OPERATION_ALTER_CONFIGS:
		return v1alpha2.ACL_OPERATION_ALTER_CONFIGS
	case v1alpha1.ACL_OPERATION_IDEMPOTENT_WRITE:
		return v1alpha2.ACL_OPERATION_IDEMPOTENT_WRITE
	case v1alpha1.ACL_OPERATION_CREATE_TOKENS:
		return v1alpha2.ACL_OPERATION_CREATE_TOKENS
	case v1alpha1.ACL_OPERATION_DESCRIBE_TOKENS:
		return v1alpha2.ACL_OPERATION_DESCRIBE_TOKENS
	default:
		return v1alpha2.ACL_OPERATION_UNSPECIFIED
	}
}

// PermissionTypeV1Alpha1ToV1Alpha2 converts ACL Permission Type enum from v1alpha1 to v1alpha2.
func PermissionTypeV1Alpha1ToV1Alpha2(t v1alpha1.ACL_PermissionType) v1alpha2.ACL_PermissionType {
	switch t {
	case v1alpha1.ACL_PERMISSION_TYPE_ANY:
		return v1alpha2.ACL_PERMISSION_TYPE_ANY
	case v1alpha1.ACL_PERMISSION_TYPE_DENY:
		return v1alpha2.ACL_PERMISSION_TYPE_DENY
	case v1alpha1.ACL_PERMISSION_TYPE_ALLOW:
		return v1alpha2.ACL_PERMISSION_TYPE_ALLOW
	default:
		return v1alpha2.ACL_PERMISSION_TYPE_UNSPECIFIED
	}
}

// ResourcePatternTypeV1Alpha1ToV1Alpha2 converts ACL Permission Pattern Type enum from v1alpha1 to v1alpha2.
func ResourcePatternTypeV1Alpha1ToV1Alpha2(t v1alpha1.ACL_ResourcePatternType) v1alpha2.ACL_ResourcePatternType {
	switch t {
	case v1alpha1.ACL_RESOURCE_PATTERN_TYPE_ANY:
		return v1alpha2.ACL_RESOURCE_PATTERN_TYPE_ANY
	case v1alpha1.ACL_RESOURCE_PATTERN_TYPE_MATCH:
		return v1alpha2.ACL_RESOURCE_PATTERN_TYPE_MATCH
	case v1alpha1.ACL_RESOURCE_PATTERN_TYPE_LITERAL:
		return v1alpha2.ACL_RESOURCE_PATTERN_TYPE_LITERAL
	case v1alpha1.ACL_RESOURCE_PATTERN_TYPE_PREFIXED:
		return v1alpha2.ACL_RESOURCE_PATTERN_TYPE_PREFIXED
	default:
		return v1alpha2.ACL_RESOURCE_PATTERN_TYPE_UNSPECIFIED
	}
}

// ResourceTypeV1Alpha2ToV1Alpha1 converts ACL Resource Type enum from v1alpha2 to v1alpha1.
func ResourceTypeV1Alpha2ToV1Alpha1(t v1alpha2.ACL_ResourceType) v1alpha1.ACL_ResourceType {
	switch t {
	case v1alpha2.ACL_RESOURCE_TYPE_ANY:
		return v1alpha1.ACL_RESOURCE_TYPE_ANY
	case v1alpha2.ACL_RESOURCE_TYPE_TOPIC:
		return v1alpha1.ACL_RESOURCE_TYPE_TOPIC
	case v1alpha2.ACL_RESOURCE_TYPE_GROUP:
		return v1alpha1.ACL_RESOURCE_TYPE_GROUP
	case v1alpha2.ACL_RESOURCE_TYPE_CLUSTER:
		return v1alpha1.ACL_RESOURCE_TYPE_CLUSTER
	case v1alpha2.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID:
		return v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID
	case v1alpha2.ACL_RESOURCE_TYPE_DELEGATION_TOKEN:
		return v1alpha1.ACL_RESOURCE_TYPE_DELEGATION_TOKEN
	case v1alpha2.ACL_RESOURCE_TYPE_USER:
		return v1alpha1.ACL_RESOURCE_TYPE_USER
	default:
		return v1alpha1.ACL_RESOURCE_TYPE_UNSPECIFIED
	}
}

// OperationV1Alpha2ToV1Alpha1 converts ACL Operation enum from v1alpha2 to v1alpha1.
func OperationV1Alpha2ToV1Alpha1(t v1alpha2.ACL_Operation) v1alpha1.ACL_Operation {
	switch t {
	case v1alpha2.ACL_OPERATION_ANY:
		return v1alpha1.ACL_OPERATION_ANY
	case v1alpha2.ACL_OPERATION_ALL:
		return v1alpha1.ACL_OPERATION_ALL
	case v1alpha2.ACL_OPERATION_READ:
		return v1alpha1.ACL_OPERATION_READ
	case v1alpha2.ACL_OPERATION_WRITE:
		return v1alpha1.ACL_OPERATION_WRITE
	case v1alpha2.ACL_OPERATION_CREATE:
		return v1alpha1.ACL_OPERATION_CREATE
	case v1alpha2.ACL_OPERATION_DELETE:
		return v1alpha1.ACL_OPERATION_DELETE
	case v1alpha2.ACL_OPERATION_ALTER:
		return v1alpha1.ACL_OPERATION_ALTER
	case v1alpha2.ACL_OPERATION_DESCRIBE:
		return v1alpha1.ACL_OPERATION_DESCRIBE
	case v1alpha2.ACL_OPERATION_CLUSTER_ACTION:
		return v1alpha1.ACL_OPERATION_CLUSTER_ACTION
	case v1alpha2.ACL_OPERATION_DESCRIBE_CONFIGS:
		return v1alpha1.ACL_OPERATION_DESCRIBE_CONFIGS
	case v1alpha2.ACL_OPERATION_ALTER_CONFIGS:
		return v1alpha1.ACL_OPERATION_ALTER_CONFIGS
	case v1alpha2.ACL_OPERATION_IDEMPOTENT_WRITE:
		return v1alpha1.ACL_OPERATION_IDEMPOTENT_WRITE
	case v1alpha2.ACL_OPERATION_CREATE_TOKENS:
		return v1alpha1.ACL_OPERATION_CREATE_TOKENS
	case v1alpha2.ACL_OPERATION_DESCRIBE_TOKENS:
		return v1alpha1.ACL_OPERATION_DESCRIBE_TOKENS
	default:
		return v1alpha1.ACL_OPERATION_UNSPECIFIED
	}
}

// PermissionTypeV1Alpha2ToV1Alpha1 converts ACL Permission Type enum from v1alpha2 to v1alpha1.
func PermissionTypeV1Alpha2ToV1Alpha1(t v1alpha2.ACL_PermissionType) v1alpha1.ACL_PermissionType {
	switch t {
	case v1alpha2.ACL_PERMISSION_TYPE_ANY:
		return v1alpha1.ACL_PERMISSION_TYPE_ANY
	case v1alpha2.ACL_PERMISSION_TYPE_DENY:
		return v1alpha1.ACL_PERMISSION_TYPE_DENY
	case v1alpha2.ACL_PERMISSION_TYPE_ALLOW:
		return v1alpha1.ACL_PERMISSION_TYPE_ALLOW
	default:
		return v1alpha1.ACL_PERMISSION_TYPE_UNSPECIFIED
	}
}

// ResourcePatternTypeV1Alpha2ToV1Alpha1 converts ACL Permission Pattern Type enum from v1alpha2 to v1alpha1.
func ResourcePatternTypeV1Alpha2ToV1Alpha1(t v1alpha2.ACL_ResourcePatternType) v1alpha1.ACL_ResourcePatternType {
	switch t {
	case v1alpha2.ACL_RESOURCE_PATTERN_TYPE_ANY:
		return v1alpha1.ACL_RESOURCE_PATTERN_TYPE_ANY
	case v1alpha2.ACL_RESOURCE_PATTERN_TYPE_MATCH:
		return v1alpha1.ACL_RESOURCE_PATTERN_TYPE_MATCH
	case v1alpha2.ACL_RESOURCE_PATTERN_TYPE_LITERAL:
		return v1alpha1.ACL_RESOURCE_PATTERN_TYPE_LITERAL
	case v1alpha2.ACL_RESOURCE_PATTERN_TYPE_PREFIXED:
		return v1alpha1.ACL_RESOURCE_PATTERN_TYPE_PREFIXED
	default:
		return v1alpha1.ACL_RESOURCE_PATTERN_TYPE_UNSPECIFIED
	}
}
