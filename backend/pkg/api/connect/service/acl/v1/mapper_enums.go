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
	"fmt"

	"github.com/twmb/franz-go/pkg/kmsg"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func (*kafkaClientMapper) aclOperationToKafka(operation v1.ACL_Operation) (kmsg.ACLOperation, error) {
	switch operation {
	case v1.ACL_OPERATION_ANY:
		return kmsg.ACLOperationAny, nil
	case v1.ACL_OPERATION_ALL:
		return kmsg.ACLOperationAll, nil
	case v1.ACL_OPERATION_READ:
		return kmsg.ACLOperationRead, nil
	case v1.ACL_OPERATION_WRITE:
		return kmsg.ACLOperationWrite, nil
	case v1.ACL_OPERATION_CREATE:
		return kmsg.ACLOperationCreate, nil
	case v1.ACL_OPERATION_DELETE:
		return kmsg.ACLOperationDelete, nil
	case v1.ACL_OPERATION_ALTER:
		return kmsg.ACLOperationAlter, nil
	case v1.ACL_OPERATION_DESCRIBE:
		return kmsg.ACLOperationDescribe, nil
	case v1.ACL_OPERATION_CLUSTER_ACTION:
		return kmsg.ACLOperationClusterAction, nil
	case v1.ACL_OPERATION_DESCRIBE_CONFIGS:
		return kmsg.ACLOperationDescribeConfigs, nil
	case v1.ACL_OPERATION_ALTER_CONFIGS:
		return kmsg.ACLOperationAlterConfigs, nil
	case v1.ACL_OPERATION_IDEMPOTENT_WRITE:
		return kmsg.ACLOperationIdempotentWrite, nil
	case v1.ACL_OPERATION_CREATE_TOKENS:
		return kmsg.ACLOperationCreateTokens, nil
	case v1.ACL_OPERATION_DESCRIBE_TOKENS:
		return kmsg.ACLOperationDescribeTokens, nil
	default:
		return kmsg.ACLOperationUnknown, fmt.Errorf("failed to map given ACL operation %q to Kafka request", operation.String())
	}
}

func (*kafkaClientMapper) aclOperationToProto(operation kmsg.ACLOperation) (v1.ACL_Operation, error) {
	switch operation {
	case kmsg.ACLOperationAny:
		return v1.ACL_OPERATION_ANY, nil
	case kmsg.ACLOperationAll:
		return v1.ACL_OPERATION_ALL, nil
	case kmsg.ACLOperationRead:
		return v1.ACL_OPERATION_READ, nil
	case kmsg.ACLOperationWrite:
		return v1.ACL_OPERATION_WRITE, nil
	case kmsg.ACLOperationCreate:
		return v1.ACL_OPERATION_CREATE, nil
	case kmsg.ACLOperationDelete:
		return v1.ACL_OPERATION_DELETE, nil
	case kmsg.ACLOperationAlter:
		return v1.ACL_OPERATION_ALTER, nil
	case kmsg.ACLOperationDescribe:
		return v1.ACL_OPERATION_DESCRIBE, nil
	case kmsg.ACLOperationClusterAction:
		return v1.ACL_OPERATION_CLUSTER_ACTION, nil
	case kmsg.ACLOperationDescribeConfigs:
		return v1.ACL_OPERATION_DESCRIBE_CONFIGS, nil
	case kmsg.ACLOperationAlterConfigs:
		return v1.ACL_OPERATION_ALTER_CONFIGS, nil
	case kmsg.ACLOperationIdempotentWrite:
		return v1.ACL_OPERATION_IDEMPOTENT_WRITE, nil
	case kmsg.ACLOperationCreateTokens:
		return v1.ACL_OPERATION_CREATE_TOKENS, nil
	case kmsg.ACLOperationDescribeTokens:
		return v1.ACL_OPERATION_DESCRIBE_TOKENS, nil
	default:
		return v1.ACL_OPERATION_UNSPECIFIED, fmt.Errorf("failed to map given ACL operation %v to proto", operation.String())
	}
}

func (*kafkaClientMapper) aclPermissionTypeToKafka(permissionType v1.ACL_PermissionType) (kmsg.ACLPermissionType, error) {
	switch permissionType {
	case v1.ACL_PERMISSION_TYPE_ANY:
		return kmsg.ACLPermissionTypeAny, nil
	case v1.ACL_PERMISSION_TYPE_DENY:
		return kmsg.ACLPermissionTypeDeny, nil
	case v1.ACL_PERMISSION_TYPE_ALLOW:
		return kmsg.ACLPermissionTypeAllow, nil
	default:
		return kmsg.ACLPermissionTypeUnknown, fmt.Errorf("failed to map given ACL permission type %q to Kafka request", permissionType.String())
	}
}

func (*kafkaClientMapper) aclPermissionTypeToProto(permissionType kmsg.ACLPermissionType) (v1.ACL_PermissionType, error) {
	switch permissionType {
	case kmsg.ACLPermissionTypeAny:
		return v1.ACL_PERMISSION_TYPE_ANY, nil
	case kmsg.ACLPermissionTypeDeny:
		return v1.ACL_PERMISSION_TYPE_DENY, nil
	case kmsg.ACLPermissionTypeAllow:
		return v1.ACL_PERMISSION_TYPE_ALLOW, nil
	default:
		return v1.ACL_PERMISSION_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given ACL permission type %v to proto", permissionType.String())
	}
}

func (*kafkaClientMapper) aclResourcePatternTypeToKafka(patternType v1.ACL_ResourcePatternType) (kmsg.ACLResourcePatternType, error) {
	switch patternType {
	case v1.ACL_RESOURCE_PATTERN_TYPE_ANY:
		return kmsg.ACLResourcePatternTypeAny, nil
	case v1.ACL_RESOURCE_PATTERN_TYPE_MATCH:
		return kmsg.ACLResourcePatternTypeMatch, nil
	case v1.ACL_RESOURCE_PATTERN_TYPE_LITERAL:
		return kmsg.ACLResourcePatternTypeLiteral, nil
	case v1.ACL_RESOURCE_PATTERN_TYPE_PREFIXED:
		return kmsg.ACLResourcePatternTypePrefixed, nil
	default:
		return kmsg.ACLResourcePatternTypeUnknown, fmt.Errorf("failed to map given ACL resource pattern type %q to Kafka request", patternType.String())
	}
}

func (*kafkaClientMapper) aclResourcePatternTypeToProto(patternType kmsg.ACLResourcePatternType) (v1.ACL_ResourcePatternType, error) {
	switch patternType {
	case kmsg.ACLResourcePatternTypeAny:
		return v1.ACL_RESOURCE_PATTERN_TYPE_ANY, nil
	case kmsg.ACLResourcePatternTypeMatch:
		return v1.ACL_RESOURCE_PATTERN_TYPE_MATCH, nil
	case kmsg.ACLResourcePatternTypeLiteral:
		return v1.ACL_RESOURCE_PATTERN_TYPE_LITERAL, nil
	case kmsg.ACLResourcePatternTypePrefixed:
		return v1.ACL_RESOURCE_PATTERN_TYPE_PREFIXED, nil
	default:
		return v1.ACL_RESOURCE_PATTERN_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given ACL resource pattern type %v to proto", patternType.String())
	}
}

func (*kafkaClientMapper) aclResourceTypeToKafka(resourceType v1.ACL_ResourceType) (kmsg.ACLResourceType, error) {
	switch resourceType {
	case v1.ACL_RESOURCE_TYPE_ANY:
		return kmsg.ACLResourceTypeAny, nil
	case v1.ACL_RESOURCE_TYPE_TOPIC:
		return kmsg.ACLResourceTypeTopic, nil
	case v1.ACL_RESOURCE_TYPE_GROUP:
		return kmsg.ACLResourceTypeGroup, nil
	case v1.ACL_RESOURCE_TYPE_CLUSTER:
		return kmsg.ACLResourceTypeCluster, nil
	case v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID:
		return kmsg.ACLResourceTypeTransactionalId, nil
	case v1.ACL_RESOURCE_TYPE_USER:
		return kmsg.ACLResourceTypeUser, nil
	default:
		return kmsg.ACLResourceTypeUnknown, fmt.Errorf("failed to map given ACL resource type %q to Kafka request", resourceType.String())
	}
}

func (*kafkaClientMapper) aclResourceTypeToProto(resourceType kmsg.ACLResourceType) (v1.ACL_ResourceType, error) {
	switch resourceType {
	case kmsg.ACLResourceTypeAny:
		return v1.ACL_RESOURCE_TYPE_ANY, nil
	case kmsg.ACLResourceTypeTopic:
		return v1.ACL_RESOURCE_TYPE_TOPIC, nil
	case kmsg.ACLResourceTypeGroup:
		return v1.ACL_RESOURCE_TYPE_GROUP, nil
	case kmsg.ACLResourceTypeCluster:
		return v1.ACL_RESOURCE_TYPE_CLUSTER, nil
	case kmsg.ACLResourceTypeTransactionalId:
		return v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID, nil
	case kmsg.ACLResourceTypeUser:
		return v1.ACL_RESOURCE_TYPE_USER, nil
	default:
		return v1.ACL_RESOURCE_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given ACL resource type %q to proto", resourceType.String())
	}
}
