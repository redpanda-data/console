// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package acl

import v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"

// Defaulter updates a given ACL input resource with defaults. This makes it
// possible for API callers (and tests across the repo) to know only a minimal
// set of fields, and still retrieve or delete an ACL.
type defaulter struct{}

func (*defaulter) applyCreateACLRequest(req *v1alpha1.CreateACLRequest) {
	if req.ResourceType == v1alpha1.ACL_RESOURCE_TYPE_CLUSTER && req.ResourceName == "" {
		req.ResourceName = "kafka-cluster"
	}
}

func (d *defaulter) applyListACLsRequest(req *v1alpha1.ListACLsRequest) {
	if req.Filter == nil {
		req.Filter = &v1alpha1.ACL_Filter{}
	}
	d.applyListACLsRequestFilter(req.Filter)
}

func (*defaulter) applyListACLsRequestFilter(filter *v1alpha1.ACL_Filter) {
	if filter.ResourceType == v1alpha1.ACL_RESOURCE_TYPE_UNSPECIFIED {
		filter.ResourceType = v1alpha1.ACL_RESOURCE_TYPE_ANY
	}

	if filter.ResourcePatternType == v1alpha1.ACL_RESOURCE_PATTERN_TYPE_UNSPECIFIED {
		filter.ResourcePatternType = v1alpha1.ACL_RESOURCE_PATTERN_TYPE_ANY
	}

	if filter.Operation == v1alpha1.ACL_OPERATION_UNSPECIFIED {
		filter.Operation = v1alpha1.ACL_OPERATION_ANY
	}

	if filter.PermissionType == v1alpha1.ACL_PERMISSION_TYPE_UNSPECIFIED {
		filter.PermissionType = v1alpha1.ACL_PERMISSION_TYPE_ANY
	}
}
