// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package testutil

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRedpandaImage(t *testing.T) {
	img := RedpandaImage()
	require.NotEmpty(t, img)
	assert.True(t, strings.HasPrefix(img, "redpandadata/redpanda:"), "expected redpanda image, got: %s", img)
}

func TestKafkaConnectImage(t *testing.T) {
	img := KafkaConnectImage()
	require.NotEmpty(t, img)
	assert.True(t, strings.Contains(img, "connectors"), "expected connectors image, got: %s", img)
}

func TestOwlShopImage(t *testing.T) {
	img := OwlShopImage()
	require.NotEmpty(t, img)
	assert.True(t, strings.Contains(img, "owl-shop"), "expected owl-shop image, got: %s", img)
}

func TestImageConfigString(t *testing.T) {
	tests := []struct {
		name     string
		config   ImageConfig
		expected string
	}{
		{
			name:     "tag format",
			config:   ImageConfig{Repository: "redpandadata/redpanda", Tag: "v25.3.6"},
			expected: "redpandadata/redpanda:v25.3.6",
		},
		{
			name:     "digest format",
			config:   ImageConfig{Repository: "docker.cloudsmith.io/redpanda/connectors", Tag: "sha256:abc123"},
			expected: "docker.cloudsmith.io/redpanda/connectors@sha256:abc123",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.config.String())
		})
	}
}

func TestEnvOverride(t *testing.T) {
	t.Setenv("TEST_IMAGE_REDPANDA", "custom/redpanda:test")
	img := RedpandaImage()
	assert.Equal(t, "custom/redpanda:test", img)
}
