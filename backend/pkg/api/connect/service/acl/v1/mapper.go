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

	"github.com/redpanda-data/common-go/rpsr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"google.golang.org/genproto/googleapis/rpc/status"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

type kafkaClientMapper struct{}

// aclCreateRequestToKafka maps the proto request to create a single ACL into a kmsg.CreateACLsRequest.
func (k *kafkaClientMapper) aclCreateRequestToKafka(req *v1.CreateACLRequest) (*kmsg.CreateACLsRequest, error) {
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

// listACLFilterToDescribeACLKafka translates a proto ACL input into the kmsg.DescribeACLsRequest that is
// needed by the Kafka client to retrieve the list of applied ACLs.
// The parameter defaultToAny determines whether unspecified enum values for
// the operation, permission type, resource pattern type or resource type
// should be converted to ALL/ANY if not otherwise specified.
func (k *kafkaClientMapper) listACLFilterToDescribeACLKafka(filter *v1.ListACLsRequest_Filter) (*kmsg.DescribeACLsRequest, error) {
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

func (k *kafkaClientMapper) describeACLsResourceToProto(res kmsg.DescribeACLsResponseResource) (*v1.ListACLsResponse_Resource, error) {
	resourceType, err := k.aclResourceTypeToProto(res.ResourceType)
	if err != nil {
		return nil, err
	}

	resourcePatternType, err := k.aclResourcePatternTypeToProto(res.ResourcePatternType)
	if err != nil {
		return nil, err
	}

	aclsProto := make([]*v1.ListACLsResponse_Policy, len(res.ACLs))
	for i, aclRes := range res.ACLs {
		aclProto, err := k.describeACLsResponseResourceACLToProto(aclRes)
		if err != nil {
			return nil, fmt.Errorf("failed to map acl resource to proto: %w", err)
		}
		aclsProto[i] = aclProto
	}

	return &v1.ListACLsResponse_Resource{
		ResourceType:        resourceType,
		ResourceName:        res.ResourceName,
		ResourcePatternType: resourcePatternType,
		Acls:                aclsProto,
	}, nil
}

func (k *kafkaClientMapper) describeACLsResponseResourceACLToProto(resource kmsg.DescribeACLsResponseResourceACL) (*v1.ListACLsResponse_Policy, error) {
	operation, err := k.aclOperationToProto(resource.Operation)
	if err != nil {
		return nil, err
	}

	permissionType, err := k.aclPermissionTypeToProto(resource.PermissionType)
	if err != nil {
		return nil, err
	}

	return &v1.ListACLsResponse_Policy{
		Principal:      resource.Principal,
		Host:           resource.Host,
		Operation:      operation,
		PermissionType: permissionType,
	}, nil
}

// deleteACLFilterToDeleteACLKafka translates a proto ACL input into the kmsg.DeleteACLsRequest that is
// needed by the Kafka client to delete the list of ACLs that match the filter.
func (k *kafkaClientMapper) deleteACLFilterToDeleteACLKafka(filter *v1.DeleteACLsRequest_Filter) (*kmsg.DeleteACLsRequest, error) {
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

func (k *kafkaClientMapper) deleteACLMatchingResultsToProtos(acls []kmsg.DeleteACLsResponseResultMatchingACL) ([]*v1.DeleteACLsResponse_MatchingACL, error) {
	matchingACLs := make([]*v1.DeleteACLsResponse_MatchingACL, 0, len(acls))
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

func (k *kafkaClientMapper) deleteACLMatchingResultToProto(acl kmsg.DeleteACLsResponseResultMatchingACL) (*v1.DeleteACLsResponse_MatchingACL, error) {
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

	return &v1.DeleteACLsResponse_MatchingACL{
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

type schemaRegistryMapper struct{}

func (srm *schemaRegistryMapper) describeSRACLsResourceToProto(res []rpsr.ACL) ([]*v1.ListACLsResponse_Resource, error) {
	if len(res) == 0 {
		return nil, nil
	}

	// The v1 response groups ACLs by resource_type, resource_name, and
	// resource_pattern_type: For example:
	//   rt: "SUBJECT", rn: "my-subject", rpt: "LITERAL" -> [acl1, acl2]
	resourceMap := make(map[string][]*v1.ListACLsResponse_Policy)
	resourceKeys := make(map[string]*v1.ListACLsResponse_Resource)

	for _, aclRes := range res {
		resourceType, err := srm.srACLResourceTypeToProto(aclRes.ResourceType)
		if err != nil {
			return nil, fmt.Errorf("failed to map resource type: %w", err)
		}
		resourcePatternType, err := srm.srACLPatternTypeToProto(aclRes.PatternType)
		if err != nil {
			return nil, fmt.Errorf("failed to map pattern type: %w", err)
		}

		// Create unique key for grouping as mentioned above.
		key := fmt.Sprintf("%s:%s:%s", resourceType.String(), aclRes.Resource, resourcePatternType.String())

		aclProto, err := srm.srACLToProto(aclRes)
		if err != nil {
			return nil, fmt.Errorf("failed to map schema registry ACLs to proto response: %w", err)
		}

		// First we group ACLs by resource key.
		resourceMap[key] = append(resourceMap[key], aclProto)

		// Then store resource info (same for all ACLs with same key).
		if _, exists := resourceKeys[key]; !exists {
			resourceKeys[key] = &v1.ListACLsResponse_Resource{
				ResourceType:        resourceType,
				ResourceName:        aclRes.Resource,
				ResourcePatternType: resourcePatternType,
			}
		}
	}

	response := make([]*v1.ListACLsResponse_Resource, 0, len(resourceKeys))
	for key, policies := range resourceMap {
		resource := resourceKeys[key]
		resource.Acls = policies
		response = append(response, resource)
	}

	return response, nil
}

// listACLFilterToDescribeACLSR converts a protobuf ACL filter to Schema
// Registry ACL filters. It returns nil if the filter is not relevant for Schema
// Registry resources, an empty slice for nil filter (meaning all ACLs), or a
// slice with a single ACL filter for Schema Registry queries.
func (srm *schemaRegistryMapper) listACLFilterToDescribeACLSR(filter *v1.ListACLsRequest_Filter) []rpsr.ACL {
	if filter == nil {
		// nil filter means we don't want to filter anything, so we return an
		// empty slice that effectively means "all ACLs".
		return []rpsr.ACL{}
	}
	if filter.ResourceType == v1.ACL_RESOURCE_TYPE_REGISTRY || filter.ResourceType == v1.ACL_RESOURCE_TYPE_SUBJECT || filter.ResourceType == v1.ACL_RESOURCE_TYPE_ANY {
		var principal, resourceName, host string
		if filter.Principal != nil {
			principal = *filter.Principal
		}
		if filter.ResourceName != nil {
			resourceName = *filter.ResourceName
		}
		if filter.Host != nil {
			host = *filter.Host
		}

		// rpsr can receive multiple filters, but we only support one filter
		// at a time. We return a slice to simplify the usage downstream.
		return []rpsr.ACL{
			{
				Principal:    principal,
				Resource:     resourceName,
				ResourceType: srm.protoResourceTypeToSR(filter.ResourceType),
				PatternType:  srm.protoPatternTypeToSR(filter.ResourcePatternType),
				Host:         host,
				Operation:    srm.protoOperationToSR(filter.Operation),
				Permission:   srm.protoPermissionToSR(filter.PermissionType),
			},
		}
	}
	// Returning nil means that the filter is not relevant for Schema Registry
	// hence, we don't want to even query for ACLs.
	return nil
}

func (srm *schemaRegistryMapper) srACLToProto(acl rpsr.ACL) (*v1.ListACLsResponse_Policy, error) {
	operation, err := srm.srACLOperationToProto(acl.Operation)
	if err != nil {
		return nil, err
	}

	permissionType, err := srm.srACLPermissionToProto(acl.Permission)
	if err != nil {
		return nil, err
	}

	return &v1.ListACLsResponse_Policy{
		Principal:      acl.Principal,
		Host:           acl.Host,
		Operation:      operation,
		PermissionType: permissionType,
	}, nil
}

func (*schemaRegistryMapper) srACLResourceTypeToProto(resourceType rpsr.ResourceType) (v1.ACL_ResourceType, error) {
	switch resourceType {
	case rpsr.ResourceTypeAny:
		return v1.ACL_RESOURCE_TYPE_ANY, nil
	case rpsr.ResourceTypeRegistry:
		return v1.ACL_RESOURCE_TYPE_REGISTRY, nil
	case rpsr.ResourceTypeSubject:
		return v1.ACL_RESOURCE_TYPE_SUBJECT, nil
	default:
		return v1.ACL_RESOURCE_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given Schema Registry resource type %q to proto", resourceType)
	}
}

func (*schemaRegistryMapper) srACLPatternTypeToProto(patternType rpsr.PatternType) (v1.ACL_ResourcePatternType, error) {
	switch patternType {
	case rpsr.PatternTypeAny:
		return v1.ACL_RESOURCE_PATTERN_TYPE_ANY, nil
	case rpsr.PatternTypeLiteral:
		return v1.ACL_RESOURCE_PATTERN_TYPE_LITERAL, nil
	case rpsr.PatternTypePrefix:
		return v1.ACL_RESOURCE_PATTERN_TYPE_PREFIXED, nil
	default:
		return v1.ACL_RESOURCE_PATTERN_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given Schema Registry pattern type %q to proto", patternType)
	}
}

func (*schemaRegistryMapper) srACLOperationToProto(operation rpsr.Operation) (v1.ACL_Operation, error) {
	switch operation {
	case rpsr.OperationAny:
		return v1.ACL_OPERATION_ANY, nil
	case rpsr.OperationAll:
		return v1.ACL_OPERATION_ALL, nil
	case rpsr.OperationRead:
		return v1.ACL_OPERATION_READ, nil
	case rpsr.OperationWrite:
		return v1.ACL_OPERATION_WRITE, nil
	case rpsr.OperationDelete:
		return v1.ACL_OPERATION_DELETE, nil
	case rpsr.OperationDescribe:
		return v1.ACL_OPERATION_DESCRIBE, nil
	case rpsr.OperationDescribeConfig:
		return v1.ACL_OPERATION_DESCRIBE_CONFIGS, nil
	case rpsr.OperationAlter:
		return v1.ACL_OPERATION_ALTER, nil
	case rpsr.OperationAlterConfig:
		return v1.ACL_OPERATION_ALTER_CONFIGS, nil
	default:
		return v1.ACL_OPERATION_UNSPECIFIED, fmt.Errorf("failed to map given Schema Registry operation %q to proto", operation)
	}
}

func (*schemaRegistryMapper) srACLPermissionToProto(permission rpsr.Permission) (v1.ACL_PermissionType, error) {
	switch permission {
	case rpsr.PermissionAny:
		return v1.ACL_PERMISSION_TYPE_ANY, nil
	case rpsr.PermissionAllow:
		return v1.ACL_PERMISSION_TYPE_ALLOW, nil
	case rpsr.PermissionDeny:
		return v1.ACL_PERMISSION_TYPE_DENY, nil
	default:
		return v1.ACL_PERMISSION_TYPE_UNSPECIFIED, fmt.Errorf("failed to map given Schema Registry permission %q to proto", permission)
	}
}

func (*schemaRegistryMapper) protoResourceTypeToSR(resourceType v1.ACL_ResourceType) rpsr.ResourceType {
	switch resourceType {
	case v1.ACL_RESOURCE_TYPE_REGISTRY:
		return rpsr.ResourceTypeRegistry
	case v1.ACL_RESOURCE_TYPE_SUBJECT:
		return rpsr.ResourceTypeSubject
	case v1.ACL_RESOURCE_TYPE_ANY:
		return "" // TODO: temporary solution, RP doesn't support ANY yet.
	default:
		return ""
	}
}

func (*schemaRegistryMapper) protoPatternTypeToSR(patternType v1.ACL_ResourcePatternType) rpsr.PatternType {
	switch patternType {
	case v1.ACL_RESOURCE_PATTERN_TYPE_LITERAL:
		return rpsr.PatternTypeLiteral
	case v1.ACL_RESOURCE_PATTERN_TYPE_PREFIXED:
		return rpsr.PatternTypePrefix
	case v1.ACL_RESOURCE_PATTERN_TYPE_ANY:
		return "" // TODO: temporary solution, RP doesn't support ANY yet.
	default:
		return ""
	}
}

func (*schemaRegistryMapper) protoOperationToSR(operation v1.ACL_Operation) rpsr.Operation {
	switch operation {
	case v1.ACL_OPERATION_READ:
		return rpsr.OperationRead
	case v1.ACL_OPERATION_WRITE:
		return rpsr.OperationWrite
	case v1.ACL_OPERATION_DELETE:
		return rpsr.OperationDelete
	case v1.ACL_OPERATION_DESCRIBE:
		return rpsr.OperationDescribe
	case v1.ACL_OPERATION_DESCRIBE_CONFIGS:
		return rpsr.OperationDescribeConfig
	case v1.ACL_OPERATION_ALTER:
		return rpsr.OperationAlter
	case v1.ACL_OPERATION_ALTER_CONFIGS:
		return rpsr.OperationAlterConfig
	case v1.ACL_OPERATION_ALL:
		return rpsr.OperationAll
	case v1.ACL_OPERATION_ANY:
		return "" // TODO: temporary solution, RP doesn't support ANY yet.
	default:
		return ""
	}
}

func (*schemaRegistryMapper) protoPermissionToSR(permissionType v1.ACL_PermissionType) rpsr.Permission {
	switch permissionType {
	case v1.ACL_PERMISSION_TYPE_ALLOW:
		return rpsr.PermissionAllow
	case v1.ACL_PERMISSION_TYPE_DENY:
		return rpsr.PermissionDeny
	case v1.ACL_PERMISSION_TYPE_ANY:
		return "" // TODO: temporary solution, RP doesn't support ANY yet.
	default:
		return ""
	}
}
