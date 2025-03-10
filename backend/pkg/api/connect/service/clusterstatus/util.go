// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package clusterstatus

import consolev1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"

func setStatus(s *consolev1alpha1.ComponentStatus, status consolev1alpha1.StatusType, reason string) {
	if status > s.Status {
		s.Status = status
		s.StatusReason = reason
	}
}

// intSliceToInt32Slice converts a slice of int to a slice of int32.
func intSliceToInt32Slice(in []int) []int32 {
	out := make([]int32, len(in))
	for i, v := range in {
		out[i] = int32(v)
	}
	return out
}
