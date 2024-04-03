// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package topic

import v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"

// Defaulter updates a given Topic input request with defaults.
type defaulter struct{}

func (*defaulter) applyListTopicsRequest(req *v1alpha1.ListTopicsRequest) {
	if req.GetPageSize() == 0 {
		req.PageSize = 100
	}
}
