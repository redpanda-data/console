// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package interceptor

import (
	"github.com/redpanda-data/console/backend/pkg/connector/guide"
	"github.com/redpanda-data/console/backend/pkg/connector/patch"
)

// Option implements the functional options pattern for Interceptor.
type Option = func(in *Interceptor)

// WithAdditionalPatches adds one or more patches that shall be considered
// by the Interceptor.
func WithAdditionalPatches(patches ...patch.ConfigPatch) Option {
	return func(in *Interceptor) {
		in.configPatches = append(in.configPatches, patches...)
	}
}

// WithAdditionalGuides sets one or more guides to be used by the interceptor.
// guides that already exist for a given classname will be replaced.
func WithAdditionalGuides(guides ...guide.Guide) Option {
	return func(in *Interceptor) {
		in.guides = append(in.guides, guides...)
	}
}
