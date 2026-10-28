// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package pipeline

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8stesting "k8s.io/client-go/testing"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// The fake client can't run admission, so each case injects the API server's
// answer to the dry-run probe.
func TestVerifyAdmissionPolicy(t *testing.T) {
	gr := pipelineGVR.GroupResource()
	testCases := []struct {
		name     string
		probeErr error
		wantErr  string
	}{
		{name: "policy missing", probeErr: nil, wantErr: "ValidatingAdmissionPolicy for Console isn't installed"},
		{
			name:     "denied by the policy",
			probeErr: k8serrors.NewInvalid(schema.GroupKind{Group: "cluster.redpanda.com", Kind: "Pipeline"}, "console-admission-probe-x7k2q", nil),
		},
		{
			name:     "denied by a webhook",
			probeErr: k8serrors.NewForbidden(gr, "console-admission-probe-x7k2q", errors.New(`admission webhook "pipelines.redpanda.com" denied the request`)),
		},
		{
			name: "RBAC forbids create",
			probeErr: k8serrors.NewForbidden(gr, "console-admission-probe-x7k2q", errors.New(
				`User "system:serviceaccount:redpanda:console" cannot create resource "pipelines" in API group "cluster.redpanda.com" in the namespace "pipelines"`)),
			wantErr: "Console's ServiceAccount can't create Pipelines",
		},
		{name: "CRD missing", probeErr: k8serrors.NewNotFound(gr, ""), wantErr: "failed to check the Pipeline admission policy"},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			env := newTestEnv(t)
			var probe k8stesting.CreateActionImpl
			env.client.PrependReactor("create", "pipelines", func(a k8stesting.Action) (bool, runtime.Object, error) {
				var ok bool
				probe, ok = a.(k8stesting.CreateActionImpl)
				require.True(t, ok)
				return true, probe.GetObject(), tc.probeErr
			})

			err := env.svc.VerifyAdmissionPolicy(context.Background())
			if tc.wantErr == "" {
				require.NoError(t, err)
			} else {
				assert.ErrorContains(t, err, tc.wantErr)
			}

			assert.Equal(t, []string{metav1.DryRunAll}, probe.CreateOptions.DryRun)
			obj, ok := probe.GetObject().(*unstructured.Unstructured)
			require.True(t, ok)
			assert.Equal(t, "console-admission-probe-x7k2q", obj.GetName())
			assert.Equal(t, "pipelines", obj.GetNamespace())
			assert.Equal(t, managedByValue, obj.GetLabels()[managedByLabel])
			image, _, _ := unstructured.NestedString(obj.Object, "spec", "image")
			assert.Equal(t, "probe", image)
			configYAML, _, _ := unstructured.NestedString(obj.Object, "spec", "configYaml")
			assert.NotEmpty(t, configYAML)
		})
	}
}

func TestVerifyAdmissionPolicySkipped(t *testing.T) {
	for name, cfg := range map[string]config.PipelinesKubernetes{
		"impersonate user":   {Enabled: true, Namespace: "pipelines", ImpersonateUser: true},
		"skipAdmissionCheck": {Enabled: true, Namespace: "pipelines", SkipAdmissionCheck: true},
	} {
		t.Run(name, func(t *testing.T) {
			env := newTestEnvWithConfig(t, cfg)
			require.NoError(t, env.svc.VerifyAdmissionPolicy(context.Background()))
			assert.Empty(t, env.client.Actions())
		})
	}
}
