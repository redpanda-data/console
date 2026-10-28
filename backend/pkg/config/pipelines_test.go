// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPipelinesKubernetesValidate(t *testing.T) {
	testCases := []struct {
		name          string
		cfg           PipelinesKubernetes
		authenticated bool
		wantErr       string
	}{
		{name: "disabled ignores everything", cfg: PipelinesKubernetes{Namespace: "Not Valid"}},
		{name: "enabled", authenticated: true, cfg: PipelinesKubernetes{Enabled: true, Namespace: "pipelines", ClusterRef: "redpanda", UserRef: "connect"}},
		{name: "no authentication", cfg: PipelinesKubernetes{Enabled: true, Namespace: "pipelines"}, wantErr: "Console has no authentication method enabled"},
		{name: "unauthenticated allowed", cfg: PipelinesKubernetes{Enabled: true, Namespace: "pipelines", AllowUnauthenticated: true}},
		{name: "namespace required", authenticated: true, cfg: PipelinesKubernetes{Enabled: true}, wantErr: "namespace is required"},
		{name: "invalid namespace", authenticated: true, cfg: PipelinesKubernetes{Enabled: true, Namespace: "Pipelines"}, wantErr: "invalid pipelines.kubernetes.namespace"},
		{name: "invalid clusterRef", authenticated: true, cfg: PipelinesKubernetes{Enabled: true, Namespace: "pipelines", ClusterRef: "Redpanda_1"}, wantErr: "invalid pipelines.kubernetes.clusterRef"},
		{name: "invalid userRef", authenticated: true, cfg: PipelinesKubernetes{Enabled: true, Namespace: "pipelines", UserRef: "Connect User"}, wantErr: "invalid pipelines.kubernetes.userRef"},
		{name: "clusterRef without userRef", authenticated: true, cfg: PipelinesKubernetes{Enabled: true, Namespace: "pipelines", ClusterRef: "redpanda"}, wantErr: "clusterRef requires pipelines.kubernetes.userRef"},
		{name: "clusterRef with bootstrap user", authenticated: true, cfg: PipelinesKubernetes{Enabled: true, Namespace: "pipelines", ClusterRef: "redpanda", AllowBootstrapUser: true}},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tc.cfg.SetAuthenticationEnabled(tc.authenticated)
			err := tc.cfg.Validate()
			if tc.wantErr == "" {
				assert.NoError(t, err)
				return
			}
			assert.ErrorContains(t, err, tc.wantErr)
		})
	}
}
