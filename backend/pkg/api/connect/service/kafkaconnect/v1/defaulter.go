// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafkaconnect

import v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"

// Defaulter updates a given kafkaconnect request with defaults.
type defaulter struct{}

func (*defaulter) applyListConnectorsRequest(req *v1.ListConnectorsRequest) {
	if req.GetPageSize() == 0 {
		req.PageSize = 100
	}
}
