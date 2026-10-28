// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

func TestOSSDefaultEndpointsPipelineService(t *testing.T) {
	testCases := []struct {
		name    string
		enabled bool
	}{
		{name: "kubernetes pipelines disabled", enabled: false},
		{name: "kubernetes pipelines enabled", enabled: true},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := &config.Config{}
			cfg.Pipelines.Kubernetes.Enabled = tc.enabled

			var found *EndpointCompatibilityEndpoint
			for _, e := range ossDefaultEndpoints(cfg) {
				if e.Endpoint == consolev1alpha1connect.PipelineServiceName {
					found = &e
				}
			}
			require.NotNil(t, found)
			assert.Equal(t, "POST", found.Method)
			assert.Equal(t, tc.enabled, found.IsSupported)
		})
	}
}
