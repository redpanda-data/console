// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package version provides the binary's version information that is injected via build flags.
package version

var (
	// ------------------------------------------------------------------------
	// Below parameters are set at build time using ldflags.
	// ------------------------------------------------------------------------

	// Version is Console's SemVer version (for example: v1.0.0). If this binary
	// does not have a SemVer release it will show the latest git sha. Examples:
	// - v1.0.0
	// - master-f97e56e
	// - development
	Version = "development"
	// BuiltAt is a timestamp in UNIX epoch format that indicates when the
	// binary was built.
	BuiltAt = "<not set>"
)
