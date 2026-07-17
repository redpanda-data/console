// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package redpanda

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVersionFromString(t *testing.T) {
	tests := []struct {
		name    string
		version string
		want    Version
		wantErr bool
	}{
		{name: "with v prefix", version: "v26.2.1", want: Version{26, 2, 1}},
		{name: "with build hash", version: "v26.2.1 - 491e56900d2316fcbb22aa1d37e7195897878309", want: Version{26, 2, 1}},
		{name: "no v prefix", version: "26.2.0", want: Version{26, 2, 0}},
		{name: "release candidate", version: "v26.2.0-rc1", want: Version{26, 2, 0}},
		{name: "dev suffix", version: "v26.2.0-dev", want: Version{26, 2, 0}},
		{name: "nightly suffix", version: "v26.2.0-nightly", want: Version{26, 2, 0}},
		{name: "leading non-version token is rejected (anchored)", version: "Redpanda v26.2.0", wantErr: true},
		{name: "unknown", version: "unknown", wantErr: true},
		{name: "invalid", version: "invalid", wantErr: true},
		{name: "empty", version: "", wantErr: true},
		{name: "dev build without semver", version: "dev", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := VersionFromString(tt.version)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestVersionIsAtLeast(t *testing.T) {
	tests := []struct {
		name    string
		version string
		minimum Version
		want    bool
	}{
		// major.feature.patch comparisons against 26.2.0
		{name: "exact minimum with build hash", version: "v26.2.0 - 491e56900d2316fcbb22aa1d37e7195897878309", minimum: Version{26, 2, 0}, want: true},
		{name: "exact minimum", version: "v26.2.0", minimum: Version{26, 2, 0}, want: true},
		{name: "patch above minimum", version: "v26.2.3", minimum: Version{26, 2, 0}, want: true},
		{name: "feature above minimum", version: "v26.3.0", minimum: Version{26, 2, 0}, want: true},
		{name: "major above minimum", version: "v27.0.0", minimum: Version{26, 2, 0}, want: true},
		{name: "release candidate of minimum counts", version: "v26.2.0-rc1", minimum: Version{26, 2, 0}, want: true},
		{name: "patch below minimum", version: "v26.1.9", minimum: Version{26, 2, 0}, want: false},
		{name: "major below minimum", version: "v25.3.1", minimum: Version{26, 2, 0}, want: false},
		// major.feature-only floor (patch 0), mirroring the gbac >= 26.1 check
		{name: "gbac: feature at floor", version: "v26.1.4 - abc123", minimum: Version{26, 1, 0}, want: true},
		{name: "gbac: feature above floor", version: "v26.2.0 - abc123", minimum: Version{26, 1, 0}, want: true},
		{name: "gbac: major above floor", version: "v27.0.0 - abc123", minimum: Version{26, 1, 0}, want: true},
		{name: "gbac: feature below floor", version: "v26.0.9 - abc123", minimum: Version{26, 1, 0}, want: false},
		{name: "gbac: major below floor", version: "v25.3.0 - abc123", minimum: Version{26, 1, 0}, want: false},
		{name: "gbac: exact floor", version: "v26.1.0", minimum: Version{26, 1, 0}, want: true},
		{name: "gbac: exact floor no v prefix", version: "26.1.0", minimum: Version{26, 1, 0}, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			version, err := VersionFromString(tt.version)
			require.NoError(t, err)
			assert.Equal(t, tt.want, version.IsAtLeast(tt.minimum))
		})
	}
}

func TestMustParseVersion(t *testing.T) {
	assert.Equal(t, Version{26, 2, 0}, MustParseVersion("26.2.0"))
	assert.Panics(t, func() { MustParseVersion("not-a-version") })
}
