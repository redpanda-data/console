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
	"google.golang.org/genproto/googleapis/rpc/status"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

type kafkaClientMapper struct{}

// aclCreateRequestToKafka maps the proto request to create a single ACL into a kmsg.CreateACLsRequest.
func (k *kafkaClientMapper) aclCreateRequestToKafka(req *v1alpha1.CreateACLRequest) (*kmsg.CreateACLsRequest, error) {
	resourceType, err := k.aclResourceTypeToKafka(req.ResourceType)
	if err != nil {
		return nil, err
	}

	operation, err := k.aclOperationToKafka(req.Operation)
	if err != nil {
		return nil, err
	}

	permissionType, err := k.aclPermissionTypeToKafka(req.PermissionType)
	if err != nil {
		return nil, err
	}

	resourcePatternType, err := k.aclResourcePatternTypeToKafka(req.ResourcePatternType)
	if err != nil {
		return nil, err
	}

	creation := kmsg.NewCreateACLsRequestCreation()
	creation.Host = req.Host
	creation.Principal = req.Principal
	creation.Operation = operation
	creation.ResourceType = resourceType
	creation.PermissionType = permissionType
	creation.ResourcePatternType = resourcePatternType
	creation.ResourceName = req.ResourceName

	kafkaReq := kmsg.NewCreateACLsRequest()
	kafkaReq.Creations = []kmsg.CreateACLsRequestCreation{creation}

	return &kafkaReq, nil
}

// aclFilterToDescribeACLKafka translates a proto ACL input into the kmsg.DescribeACLsRequest that is
// needed by the Kafka client to retrieve the list of applied ACLs.
// The parameter defaultToAny determines whether unspecified enum values for
// the operation, permission type, resource pattern type or resource type
// should be converted to ALL/ANY if not otherwise specified.
func (k *kafkaClientMapper) aclFilterToDescribeACLKafka(filter *v1alpha1.ACL_Filter) (*kmsg.DescribeACLsRequest, error) {
	aclOperation, err := k.aclOperationToKafka(filter.Operation)
	if err != nil {
		return nil, err
	}
	aclPermissionType, err := k.aclPermissionTypeToKafka(filter.PermissionType)
	if err != nil {
		return nil, err
	}

	aclResourcePatternType, err := k.aclResourcePatternTypeToKafka(filter.ResourcePatternType)
	if err != nil {
		return nil, err
	}

	aclResourceType, err := k.aclResourceTypeToKafka(filter.ResourceType)
	if err != nil {
		return nil, err
	}

	req := kmsg.NewDescribeACLsRequest()
	req.Host = filter.Host
	req.Principal = filter.Principal
	req.ResourceName = filter.ResourceName
	req.Operation = aclOperation
	req.PermissionType = aclPermissionType
	req.ResourcePatternType = aclResourcePatternType
	req.ResourceType = aclResourceType

	return &req, nil
}

func (k *kafkaClientMapper) describeACLsResourceToProto(res kmsg.DescribeACLsResponseResource) (*v1alpha1.ListACLsResponse_Resource, error) {
	resourceType, err := k.aclResourceTypeToProto(res.ResourceType)
	if err != nil {
		return nil, err
	}

	resourcePatternType, err := k.aclResourcePatternTypeToProto(res.ResourcePatternType)
	if err != nil {
		return nil, err
	}

	aclsProto := make([]*v1alpha1.ListACLsResponse_Policy, len(res.ACLs))
	for i, aclRes := range res.ACLs {
		aclProto, err := k.describeACLsResponseResourceACLToProto(aclRes)
		if err != nil {
			return nil, fmt.Errorf("failed to map acl resource to proto: %w", err)
		}
		aclsProto[i] = aclProto
	}

	return &v1alpha1.ListACLsResponse_Resource{
		ResourceType:        resourceType,
		ResourceName:        res.ResourceName,
		ResourcePatternType: resourcePatternType,
		Acls:                aclsProto,
	}, nil
}

func (k *kafkaClientMapper) describeACLsResponseResourceACLToProto(resource kmsg.DescribeACLsResponseResourceACL) (*v1alpha1.ListACLsResponse_Policy, error) {
	operation, err := k.aclOperationToProto(resource.Operation)
	if err != nil {
		return nil, err
	}

	permissionType, err := k.aclPermissionTypeToProto(resource.PermissionType)
	if err != nil {
		return nil, err
	}

	return &v1alpha1.ListACLsResponse_Policy{
		Principal:      resource.Principal,
		Host:           resource.Host,
		Operation:      operation,
		PermissionType: permissionType,
	}, nil
}

// aclFilterToDeleteACLKafka translates a proto ACL input into the kmsg.DeleteACLsRequest that is
// needed by the Kafka client to delete the list of ACLs that match the filter.
func (k *kafkaClientMapper) aclFilterToDeleteACLKafka(filter *v1alpha1.ACL_Filter) (*kmsg.DeleteACLsRequest, error) {
	resourceType, err := k.aclResourceTypeToKafka(filter.ResourceType)
	if err != nil {
		return nil, err
	}

	operation, err := k.aclOperationToKafka(filter.Operation)
	if err != nil {
		return nil, err
	}

	permissionType, err := k.aclPermissionTypeToKafka(filter.PermissionType)
	if err != nil {
		return nil, err
	}

	resourcePatternType, err := k.aclResourcePatternTypeToKafka(filter.ResourcePatternType)
	if err != nil {
		return nil, err
	}

	deletionFilter := kmsg.NewDeleteACLsRequestFilter()
	deletionFilter.Host = filter.Host
	deletionFilter.Principal = filter.Principal
	deletionFilter.Operation = operation
	deletionFilter.ResourceType = resourceType
	deletionFilter.PermissionType = permissionType
	deletionFilter.ResourcePatternType = resourcePatternType
	deletionFilter.ResourceName = filter.ResourceName

	kafkaReq := kmsg.NewDeleteACLsRequest()
	kafkaReq.Filters = []kmsg.DeleteACLsRequestFilter{deletionFilter}

	return &kafkaReq, nil
}

func (k *kafkaClientMapper) deleteACLMatchingResultsToProtos(acls []kmsg.DeleteACLsResponseResultMatchingACL) ([]*v1alpha1.DeleteACLsResponse_MatchingACL, error) {
	matchingACLs := make([]*v1alpha1.DeleteACLsResponse_MatchingACL, 0, len(acls))
	for _, acl := range acls {
		protoACL, err := k.deleteACLMatchingResultToProto(acl)
		if err != nil {
			// This would lead to
			return nil, fmt.Errorf("failed to map matching acl to proto: %w", err)
		}
		matchingACLs = append(matchingACLs, protoACL)
	}

	return matchingACLs, nil
}

func (k *kafkaClientMapper) deleteACLMatchingResultToProto(acl kmsg.DeleteACLsResponseResultMatchingACL) (*v1alpha1.DeleteACLsResponse_MatchingACL, error) {
	resourceType, err := k.aclResourceTypeToProto(acl.ResourceType)
	if err != nil {
		return nil, err
	}

	operation, err := k.aclOperationToProto(acl.Operation)
	if err != nil {
		return nil, err
	}

	permissionType, err := k.aclPermissionTypeToProto(acl.PermissionType)
	if err != nil {
		return nil, err
	}

	resourcePatternType, err := k.aclResourcePatternTypeToProto(acl.ResourcePatternType)
	if err != nil {
		return nil, err
	}

	var statusErr *status.Status
	if acl.ErrorCode != 0 {
		connectErr := apierrors.NewConnectErrorFromKafkaErrorCode(acl.ErrorCode, acl.ErrorMessage)
		statusErr = apierrors.ConnectErrorToGrpcStatus(connectErr)
	}

	return &v1alpha1.DeleteACLsResponse_MatchingACL{
		ResourceType:        resourceType,
		ResourceName:        acl.ResourceName,
		ResourcePatternType: resourcePatternType,
		Principal:           acl.Principal,
		Host:                acl.Host,
		Operation:           operation,
		PermissionType:      permissionType,
		Error:               statusErr,
	}, nil
}

func (*kafkaClientMapper) aclOperationToKafka(operation v1alpha1.ACL_Operation) (kmsg.ACLOperation, error) {
	switch operation {
	case v1alpha1.ACL_OPERATION_ANY:
		return kmsg.ACLOperationAny, nil
	case v1alpha1.ACL_OPERATION_ALL:
		return kmsg.ACLOperationAll, nil
	case v1alpha1.ACL_OPERATION_READ:
		return kmsg.ACLOperationRead, nil
	case v1alpha1.ACL_OPERATION_WRITE:
		return kmsg.ACLOperationWrite, nil
	case v1alpha1.ACL_OPERATION_CREATE:
		return kmsg.ACLOperationCreate, nil
	case v1alpha1.ACL_OPERATION_DELETE:
		return kmsg.ACLOperationDelete, nil
	case v1alpha1.ACL_OPERATION_ALTER:
		return kmsg.ACLOperationAlter, nil
	case v1alpha1.ACL_OPERATION_DESCRIBE:
		return kmsg.ACLOperationDescribe, nil
	case v1alpha1.ACL_OPERATION_CLUSTER_ACTION:
		return kmsg.ACLOperationClusterAction, nil
	case v1alpha1.ACL_OPERATION_DESCRIBE_CONFIGS:
		return kmsg.ACLOperationDescribeConfigs, nil
	case v1alpha1.ACL_OPERATION_ALTER_CONFIGS:
		return kmsg.ACLOperationAlterConfigs, nil
	case v1alpha1.ACL_OPERATION_IDEMPOTENT_WRITE:
		return kmsg.ACLOperationIdempotentWrite, nil
	case v1alpha1.ACL_OPERATION_CREATE_TOKENS:
		return kmsg.ACLOperationCreateTokens, nil
	case v1alpha1.ACL_OPERATION_DESCRIBE_TOKENS:
		return kmsg.ACLOperationDescribeTokens, nil
	default:
		return kmsg.ACLOperationUnknown, fmt.Errorf("failed to map given ACL operation %q to Kafka request", operation.String())
	}
}

func (*kafkaClientMapper) aclOperationToProto(operation kmsg.ACLOperation) (v1alpha1.ACL_Operation, error) {
	switch operation {
	case kmsg.ACLOperationAny:
		return v1alpha1.ACL_OPERATION_ANY, nil
	case kmsg.ACLOperationAll:
		return v1alpha1.ACL_OPERATION_ALL, nil
	case kmsg.ACLOperationRead:
		return v1alpha1.ACL_OPERATION_READ, nil
	case kmsg.ACLOperationWrite:
		return v1alpha1.ACL_OPERATION_WRITE, nil
	case kmsg.ACLOperationCreate:
		return v1alpha1.ACL_OPERATION_CREATE, nil
	case kmsg.ACLOperationDelete:
		return v1alpha1.ACL_OPERATION_DELETE, nil
	case kmsg.ACLOperationAlter:
		return v1alpha1.ACL_OPERATION_ALTER, nil
	case kmsg.ACLOperationDescribe:
		return v1alpha1.ACL_OPERATION_DESCRIBE, nil
	case kmsg.ACLOperationClusterAction:
		return v1alpha1.ACL_OPERATION_CLUSTER_ACTION, nil
	case kmsg.ACLOperationDescribeConfigs:
		return v1alpha1.ACL_OPERATION_DESCRIBE_CONFIGS, nil
	case kmsg.ACLOperationAlterConfigs:
		return v1alpha1.ACL_OPERATION_ALTER_CONFIGS, nil
	case kmsg.ACLOperationIdempotentWrite:
		return v1alpha1.ACL_OPERATION_IDEMPOTENT_WRITE, nil
	case kmsg.ACLOperationCreateTokens:
		return v1alpha1.ACL_OPERATION_CREATE_TOKENS, nil
	case kmsg.ACLOperationDescribeTokens:
		return v1alpha1.ACL_OPERATION_DESCRIBE_TOKENS, nil
	default:
		return v1alpha1.ACL_OPERATION_UNSPECIFIED, fmt.Errorf("failed to map given ACL operation %v to proto", operation.String())
	}
}

func (*kafkaClientMapper) aclPermissionTypeToKafka(permissionType v1alpha1.ACL_PermissionType) (kmsg.ACLPermissionType, error) {
	switch permissionType {
	case v1alpha1.ACL_PERMISSION_TYPE_ANY:
		return kmsg.ACLPermissionTypeAny, nil
	case v1alpha1.ACL_PERMISSION_TYPE_DENY:
		return kmsg.ACLPermissionTypeDeny, nil
	case v1alpha1.ACL_PERMISSION_TYPE_ALLOW:
		return kmsg.ACLPermissionTypeAllow, nil
	default:
		return kmsg.ACLPermissionTypeUnknown, fmt.Errorf("failed to map given ACL permission type %q to Kafka request", permissionType.String())
	}
}

func (*kafkaClientMapper) aclPermissionTypeToProto(permissionType kmsg.ACLPermissionType) (v1alpha1.ACL_PermissionType, error) {
	switch permissionType {
	case kmsg.ACLPermissionTypeAny:
		return v1alpha1.ACL_PERMISSION_TYPE_ANY, nil
	case kmsg.ACLPermissionTypeDeny:
		return v1alpha1.ACL_PERMISSION_TYPE_DENY, nil
	case kmsg.ACLPermissionTypeAllow:
		return v1alpha1.ACL_PERMISSION_TYPE_ALLOW, nil
	default:
		return v1alpha1.ACL_PERMISSION_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given ACL permission type %v to proto", permissionType.String())
	}
}

func (*kafkaClientMapper) aclResourcePatternTypeToKafka(patternType v1alpha1.ACL_ResourcePatternType) (kmsg.ACLResourcePatternType, error) {
	switch patternType {
	case v1alpha1.ACL_RESOURCE_PATTERN_TYPE_ANY:
		return kmsg.ACLResourcePatternTypeAny, nil
	case v1alpha1.ACL_RESOURCE_PATTERN_TYPE_MATCH:
		return kmsg.ACLResourcePatternTypeMatch, nil
	case v1alpha1.ACL_RESOURCE_PATTERN_TYPE_LITERAL:
		return kmsg.ACLResourcePatternTypeLiteral, nil
	case v1alpha1.ACL_RESOURCE_PATTERN_TYPE_PREFIXED:
		return kmsg.ACLResourcePatternTypePrefixed, nil
	default:
		return kmsg.ACLResourcePatternTypeUnknown, fmt.Errorf("failed to map given ACL resource pattern type %q to Kafka request", patternType.String())
	}
}

func (*kafkaClientMapper) aclResourcePatternTypeToProto(patternType kmsg.ACLResourcePatternType) (v1alpha1.ACL_ResourcePatternType, error) {
	switch patternType {
	case kmsg.ACLResourcePatternTypeAny:
		return v1alpha1.ACL_RESOURCE_PATTERN_TYPE_ANY, nil
	case kmsg.ACLResourcePatternTypeMatch:
		return v1alpha1.ACL_RESOURCE_PATTERN_TYPE_MATCH, nil
	case kmsg.ACLResourcePatternTypeLiteral:
		return v1alpha1.ACL_RESOURCE_PATTERN_TYPE_LITERAL, nil
	case kmsg.ACLResourcePatternTypePrefixed:
		return v1alpha1.ACL_RESOURCE_PATTERN_TYPE_PREFIXED, nil
	default:
		return v1alpha1.ACL_RESOURCE_PATTERN_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given ACL resource pattern type %v to proto", patternType.String())
	}
}

func (*kafkaClientMapper) aclResourceTypeToKafka(resourceType v1alpha1.ACL_ResourceType) (kmsg.ACLResourceType, error) {
	switch resourceType {
	case v1alpha1.ACL_RESOURCE_TYPE_ANY:
		return kmsg.ACLResourceTypeAny, nil
	case v1alpha1.ACL_RESOURCE_TYPE_TOPIC:
		return kmsg.ACLResourceTypeTopic, nil
	case v1alpha1.ACL_RESOURCE_TYPE_GROUP:
		return kmsg.ACLResourceTypeGroup, nil
	case v1alpha1.ACL_RESOURCE_TYPE_CLUSTER:
		return kmsg.ACLResourceTypeCluster, nil
	case v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID:
		return kmsg.ACLResourceTypeTransactionalId, nil
	case v1alpha1.ACL_RESOURCE_TYPE_USER:
		return kmsg.ACLResourceTypeUser, nil
	default:
		return kmsg.ACLResourceTypeUnknown, fmt.Errorf("failed to map given ACL resource type %q to Kafka request", resourceType.String())
	}
}

func (*kafkaClientMapper) aclResourceTypeToProto(resourceType kmsg.ACLResourceType) (v1alpha1.ACL_ResourceType, error) {
	switch resourceType {
	case kmsg.ACLResourceTypeAny:
		return v1alpha1.ACL_RESOURCE_TYPE_ANY, nil
	case kmsg.ACLResourceTypeTopic:
		return v1alpha1.ACL_RESOURCE_TYPE_TOPIC, nil
	case kmsg.ACLResourceTypeGroup:
		return v1alpha1.ACL_RESOURCE_TYPE_GROUP, nil
	case kmsg.ACLResourceTypeCluster:
		return v1alpha1.ACL_RESOURCE_TYPE_CLUSTER, nil
	case kmsg.ACLResourceTypeTransactionalId:
		return v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID, nil
	case kmsg.ACLResourceTypeUser:
		return v1alpha1.ACL_RESOURCE_TYPE_USER, nil
	default:
		return v1alpha1.ACL_RESOURCE_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given ACL resource type %q to proto", resourceType.String())
	}
}
