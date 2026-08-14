// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package redpanda provides helpers for reasoning about Redpanda clusters, such
// as parsing and comparing broker-reported version strings.
package redpanda

import (
	"fmt"
	"regexp"
	"strconv"
)

// Version is a parsed Redpanda release. Redpanda versions are major.feature.patch
// (not major.minor.patch), matching rpk's own Version type.
type Version struct {
	Major   int
	Feature int
	Patch   int
}

// versionRegex extracts the version core from a broker-reported string such as
// "v26.2.1 - 491e56900d2316fcbb22aa1d37e7195897878309", "v26.2.0-rc1", or
// "v26.2.0-dev".
var versionRegex = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)(?:\s|-rc\d+|-dev|-nightly|$)`)

// VersionFromString parses a broker-reported version string. It returns an error
// when the string has no recognizable version core (empty, "unknown", "dev", …).
func VersionFromString(s string) (Version, error) {
	match := versionRegex.FindStringSubmatch(s)
	if match == nil {
		return Version{}, fmt.Errorf("no redpanda version found in %q", s)
	}

	// The regex only captures digit groups, so these conversions cannot fail.
	major, _ := strconv.Atoi(match[1])
	feature, _ := strconv.Atoi(match[2])
	patch, _ := strconv.Atoi(match[3])
	return Version{Major: major, Feature: feature, Patch: patch}, nil
}

// MustParseVersion parses a version literal known at compile time, panicking on
// malformed input (like regexp.MustCompile). Use it only for constants.
func MustParseVersion(s string) Version {
	version, err := VersionFromString(s)
	if err != nil {
		panic(fmt.Sprintf("redpanda.MustParseVersion(%q): %v", s, err))
	}
	return version
}

// IsAtLeast reports whether v is greater than or equal to b.
func (v Version) IsAtLeast(b Version) bool {
	if v.Major != b.Major {
		return v.Major > b.Major
	}
	if v.Feature != b.Feature {
		return v.Feature > b.Feature
	}
	return v.Patch >= b.Patch
}
