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

// listACLFilterToDescribeACLKafka translates a proto ACL input into the kmsg.DescribeACLsRequest that is
// needed by the Kafka client to retrieve the list of applied ACLs.
// The parameter defaultToAny determines whether unspecified enum values for
// the operation, permission type, resource pattern type or resource type
// should be converted to ALL/ANY if not otherwise specified.
func (k *kafkaClientMapper) listACLFilterToDescribeACLKafka(filter *v1alpha1.ListACLsRequest_Filter) (*kmsg.DescribeACLsRequest, error) {
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

// deleteACLFilterToDeleteACLKafka translates a proto ACL input into the kmsg.DeleteACLsRequest that is
// needed by the Kafka client to delete the list of ACLs that match the filter.
func (k *kafkaClientMapper) deleteACLFilterToDeleteACLKafka(filter *v1alpha1.DeleteACLsRequest_Filter) (*kmsg.DeleteACLsRequest, error) {
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
