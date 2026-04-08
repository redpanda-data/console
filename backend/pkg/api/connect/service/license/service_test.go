// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package license

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestBrokerAtLeastVersion(t *testing.T) {
	tests := []struct {
		version string
		major   int
		minor   int
		want    bool
	}{
		{"v26.1.4 - abc123", 26, 1, true},
		{"v26.2.0 - abc123", 26, 1, true},
		{"v27.0.0 - abc123", 26, 1, true},
		{"v26.0.9 - abc123", 26, 1, false},
		{"v25.3.0 - abc123", 26, 1, false},
		{"v26.1.0", 26, 1, true},
		{"26.1.0", 26, 1, true},
		{"", 26, 1, false},
		{"invalid", 26, 1, false},
	}

	for _, tt := range tests {
		got := brokerAtLeastVersion(tt.version, tt.major, tt.minor)
		assert.Equal(t, tt.want, got, "brokerAtLeastVersion(%q, %d, %d)", tt.version, tt.major, tt.minor)
	}
}
