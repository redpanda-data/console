// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"

	"github.com/redpanda-data/common-go/rpadmin"
)

// RedpandaFeature is an enum for various Redpanda capabilities we care about.
//
//nolint:revive // Yes it stutters.
type redpandaFeature string

const (
	// redpandaFeatureRBAC represents RBAC feature.
	redpandaFeatureRBAC redpandaFeature = "redpanda_feature_rbac"

	// redpandaFeatureWASMDataTransforms represents WASM data transforms feature.
	redpandaFeatureWASMDataTransforms redpandaFeature = "redpanda_feature_wasm_data_transforms"
)

// checkRedpandaFeature checks whether redpanda has the specified feature in the specified state.
// Multiple states can be passed to check if feature state is any one of the given states.
// For example if "active" OR "available".
func (s *Service) checkRedpandaFeature(ctx context.Context, redpandaCl *rpadmin.AdminAPI, feature redpandaFeature) bool {
	switch feature {
	case redpandaFeatureRBAC:
		_, err := redpandaCl.Roles(ctx, "", "", "")
		if err != nil {
			return false
		}
		return true
	case redpandaFeatureWASMDataTransforms:
		_, err := redpandaCl.ListWasmTransforms(ctx)
		if err != nil {
			return false
		}
		return true
	default:
		return false
	}
}
