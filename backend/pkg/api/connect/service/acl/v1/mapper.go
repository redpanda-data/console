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

func (*schemaRegistryMapper) isSRResourceTypeOrAny(rt v1.ACL_ResourceType) bool {
	schemaRegistryACLs := map[v1.ACL_ResourceType]struct{}{
		v1.ACL_RESOURCE_TYPE_REGISTRY: {},
		v1.ACL_RESOURCE_TYPE_SUBJECT:  {},
		v1.ACL_RESOURCE_TYPE_ANY:      {},
	}

	_, ok := schemaRegistryACLs[rt]
	return ok
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
	if !srm.isSRResourceTypeOrAny(filter.GetResourceType()) {
		// Returning nil means that the filter is not relevant for Schema Registry
		// hence, we don't want to even query for ACLs.
		return nil
	}
	// rpsr can receive multiple filters, but we only support one filter
	// at a time. We return a slice to simplify the usage downstream.
	return []rpsr.ACL{
		{
			Principal:    filter.GetPrincipal(),
			Resource:     filter.GetResourceName(),
			ResourceType: srm.protoResourceTypeToSR(filter.GetResourceType()),
			PatternType:  srm.protoPatternTypeToSR(filter.GetResourcePatternType()),
			Host:         filter.GetHost(),
			Operation:    srm.protoOperationToSR(filter.GetOperation()),
			Permission:   srm.protoPermissionToSR(filter.GetPermissionType()),
		},
	}
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

// aclCreateRequestToSR maps a proto CreateACLRequest to Schema Registry ACL format.
// Returns nil if the request is not for Schema Registry resource types.
func (srm *schemaRegistryMapper) aclCreateRequestToSR(req *v1.CreateACLRequest) []rpsr.ACL {
	// Only handle Schema Registry resource types
	if req.GetResourceType() != v1.ACL_RESOURCE_TYPE_REGISTRY && req.GetResourceType() != v1.ACL_RESOURCE_TYPE_SUBJECT {
		return nil
	}

	return []rpsr.ACL{
		{
			Principal:    req.GetPrincipal(),
			Resource:     req.GetResourceName(),
			ResourceType: srm.protoResourceTypeToSR(req.GetResourceType()),
			PatternType:  srm.protoPatternTypeToSR(req.GetResourcePatternType()),
			Host:         req.GetHost(),
			Operation:    srm.protoOperationToSR(req.GetOperation()),
			Permission:   srm.protoPermissionToSR(req.GetPermissionType()),
		},
	}
}

// deleteACLFilterToSR maps a proto DeleteACLsRequest_Filter to Schema Registry ACL format.
// Returns nil if the filter is not for Schema Registry resource types.
// The logic is identical to listACLFilterToDescribeACLSR since both use the
// same filter structure.
func (srm *schemaRegistryMapper) deleteACLFilterToSR(filter *v1.DeleteACLsRequest_Filter) []rpsr.ACL {
	if filter == nil {
		return []rpsr.ACL{}
	}
	if !srm.isSRResourceTypeOrAny(filter.GetResourceType()) {
		// Returning nil means that the filter is not relevant for Schema Registry
		// hence, we don't want to even query for ACLs.
		return nil
	}
	return []rpsr.ACL{
		{
			Principal:    filter.GetPrincipal(),
			Resource:     filter.GetResourceName(),
			ResourceType: srm.protoResourceTypeToSR(filter.ResourceType),
			PatternType:  srm.protoPatternTypeToSR(filter.ResourcePatternType),
			Host:         filter.GetHost(),
			Operation:    srm.protoOperationToSR(filter.Operation),
			Permission:   srm.protoPermissionToSR(filter.PermissionType),
		},
	}
}

func (srm *schemaRegistryMapper) deleteACLMatchingResultToProto(acl rpsr.ACL) (*v1.DeleteACLsResponse_MatchingACL, error) {
	resourceType, err := srm.srACLResourceTypeToProto(acl.ResourceType)
	if err != nil {
		return nil, err
	}

	operation, err := srm.srACLOperationToProto(acl.Operation)
	if err != nil {
		return nil, err
	}

	permissionType, err := srm.srACLPermissionToProto(acl.Permission)
	if err != nil {
		return nil, err
	}

	resourcePatternType, err := srm.srACLPatternTypeToProto(acl.PatternType)
	if err != nil {
		return nil, err
	}

	return &v1.DeleteACLsResponse_MatchingACL{
		ResourceType:        resourceType,
		ResourceName:        acl.Resource,
		ResourcePatternType: resourcePatternType,
		Principal:           acl.Principal,
		Host:                acl.Host,
		Operation:           operation,
		PermissionType:      permissionType,
	}, nil
}

func (srm *schemaRegistryMapper) deleteACLMatchingResultsToProtos(acls []rpsr.ACL) ([]*v1.DeleteACLsResponse_MatchingACL, error) {
	matchingACLs := make([]*v1.DeleteACLsResponse_MatchingACL, len(acls))
	for i, acl := range acls {
		protoACL, err := srm.deleteACLMatchingResultToProto(acl)
		if err != nil {
			return nil, fmt.Errorf("failed to map matching acl to proto: %w", err)
		}
		matchingACLs[i] = protoACL
	}
	return matchingACLs, nil
}
