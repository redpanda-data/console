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
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/util/validation"

	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func cond(condType string, status metav1.ConditionStatus, reason, msg string) map[string]any {
	return map[string]any{
		"type": condType, "status": string(status), "reason": reason, "message": msg,
		"lastTransitionTime": "2026-10-01T00:00:00Z",
	}
}

func pipelineObj(name string, labels map[string]any, spec, status map[string]any) *unstructured.Unstructured {
	metadata := map[string]any{
		"name":              name,
		"namespace":         "pipelines",
		"uid":               "uid-" + name,
		"resourceVersion":   "7",
		"generation":        int64(2),
		"creationTimestamp": "2026-10-01T00:00:00Z",
	}
	if labels != nil {
		metadata["labels"] = labels
	}
	obj := map[string]any{
		"apiVersion": "cluster.redpanda.com/v1alpha2",
		"kind":       "Pipeline",
		"metadata":   metadata,
		"spec":       spec,
	}
	if status != nil {
		obj["status"] = status
	}
	return &unstructured.Unstructured{Object: obj}
}

func TestPipelineToProto(t *testing.T) {
	obj := pipelineObj("orders-abc12",
		map[string]any{managedByLabel: managedByValue},
		map[string]any{
			"displayName": "Orders",
			"description": "orders to s3",
			"configYaml":  "input: {}\n",
			"tags":        map[string]any{"team": "data"},
			"resources":   map[string]any{"requests": map[string]any{"cpu": "200m", "memory": int64(1)}},
			"image":       "evil:latest",
		},
		map[string]any{
			"observedGeneration": int64(2),
			"phase":              "Running",
			"conditions":         []any{cond("Ready", metav1.ConditionTrue, "Running", "Pipeline is running")},
		},
	)
	obj.SetAnnotations(map[string]string{createdByAnnotation: "alice@example.com"})

	cr, err := fromUnstructured(obj)
	require.NoError(t, err)
	p := pipelineToProto(cr)

	assert.Equal(t, "orders-abc12", p.GetId())
	assert.Equal(t, "Orders", p.GetDisplayName())
	assert.Equal(t, "orders to s3", p.GetDescription())
	assert.Equal(t, "input: {}\n", p.GetConfigYaml())
	assert.Equal(t, map[string]string{"team": "data"}, p.GetTags())
	assert.Equal(t, "200m", p.GetResources().GetCpuShares())
	assert.Equal(t, "1", p.GetResources().GetMemoryShares())
	assert.Equal(t, dataplanev1.Pipeline_STATE_RUNNING, p.GetState())
	assert.Nil(t, p.GetStatus())
	assert.Equal(t, "alice@example.com", p.GetCreatedBy())
	assert.Equal(t, time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), p.GetCreateTime().AsTime())
	assert.Empty(t, p.GetUrl())
}

func TestLastUpdateIgnoresStatusWrites(t *testing.T) {
	at := func(day int) *metav1.Time {
		return &metav1.Time{Time: time.Date(2026, 10, day, 0, 0, 0, 0, time.UTC)}
	}
	cr := &pipelineCR{ObjectMeta: metav1.ObjectMeta{
		CreationTimestamp: *at(1),
		ManagedFields: []metav1.ManagedFieldsEntry{
			{Manager: fieldManager, Operation: metav1.ManagedFieldsOperationApply, Time: at(2)},
			{Manager: "redpanda-operator", Operation: metav1.ManagedFieldsOperationUpdate, Subresource: "status", Time: at(9)},
		},
	}}
	assert.Equal(t, at(2).Time, lastUpdate(cr).Time)
}

func TestPipelineToProtoDisplayNameFallback(t *testing.T) {
	cr, err := fromUnstructured(pipelineObj("from-gitops", nil, map[string]any{"configYaml": "x"}, nil))
	require.NoError(t, err)
	p := pipelineToProto(cr)
	assert.Equal(t, "from-gitops", p.GetDisplayName())
	assert.Nil(t, p.GetResources())
}

func TestPipelineState(t *testing.T) {
	testCases := []struct {
		name       string
		paused     bool
		generation int64
		status     map[string]any
		wantState  dataplanev1.Pipeline_State
		wantError  string
	}{
		{
			name:      "no status yet",
			status:    nil,
			wantState: dataplanev1.Pipeline_STATE_STARTING,
		},
		{
			name:      "pending",
			status:    map[string]any{"observedGeneration": int64(2), "phase": "Pending", "conditions": []any{cond("Ready", metav1.ConditionFalse, "Provisioning", "Deployment not yet created")}},
			wantState: dataplanev1.Pipeline_STATE_STARTING,
		},
		{
			name:      "provisioning",
			status:    map[string]any{"observedGeneration": int64(2), "phase": "Provisioning", "conditions": []any{cond("Ready", metav1.ConditionFalse, "Provisioning", "Pipeline is starting up")}},
			wantState: dataplanev1.Pipeline_STATE_STARTING,
		},
		{
			name: "provisioning with failing lint init container",
			status: map[string]any{"observedGeneration": int64(2), "phase": "Provisioning", "conditions": []any{
				cond("Ready", metav1.ConditionFalse, "Provisioning", "Pipeline is starting up"),
				cond("ConfigValid", metav1.ConditionFalse, "ConfigInvalid", "lint: unknown input type"),
			}},
			wantState: dataplanev1.Pipeline_STATE_ERROR,
			wantError: "lint: unknown input type",
		},
		{
			name:      "running",
			status:    map[string]any{"observedGeneration": int64(2), "phase": "Running", "conditions": []any{cond("Ready", metav1.ConditionTrue, "Running", "Pipeline is running")}},
			wantState: dataplanev1.Pipeline_STATE_RUNNING,
		},
		{
			name:      "stopped",
			paused:    true,
			status:    map[string]any{"observedGeneration": int64(2), "phase": "Stopped", "conditions": []any{cond("Ready", metav1.ConditionTrue, "Paused", "Pipeline is paused")}},
			wantState: dataplanev1.Pipeline_STATE_STOPPED,
		},
		{
			name:      "ready false with failure reason",
			status:    map[string]any{"observedGeneration": int64(2), "phase": "Unknown", "conditions": []any{cond("Ready", metav1.ConditionFalse, "Failed", "Resource: deployments is forbidden")}},
			wantState: dataplanev1.Pipeline_STATE_ERROR,
			wantError: "Resource: deployments is forbidden",
		},
		{
			name:      "name conflict before first deploy",
			status:    map[string]any{"observedGeneration": int64(2), "phase": "Pending", "conditions": []any{cond("Ready", metav1.ConditionFalse, "NameConflict", "ConfigMap orders exists")}},
			wantState: dataplanev1.Pipeline_STATE_ERROR,
			wantError: "ConfigMap orders exists",
		},
		{
			name: "running but cluster ref broken keeps running and reports the error",
			status: map[string]any{"observedGeneration": int64(2), "phase": "Running", "conditions": []any{
				cond("Ready", metav1.ConditionTrue, "Running", "Pipeline is running"),
				cond("ClusterRef", metav1.ConditionFalse, "ClusterRefInvalid", "redpanda \"rp\" not found"),
			}},
			wantState: dataplanev1.Pipeline_STATE_RUNNING,
			wantError: "redpanda \"rp\" not found",
		},
		{
			name:       "stop not yet reconciled",
			paused:     true,
			generation: 3,
			status:     map[string]any{"observedGeneration": int64(2), "phase": "Running", "conditions": []any{cond("Ready", metav1.ConditionTrue, "Running", "Pipeline is running")}},
			wantState:  dataplanev1.Pipeline_STATE_STOPPING,
		},
		{
			name:       "start not yet reconciled",
			generation: 3,
			status:     map[string]any{"observedGeneration": int64(2), "phase": "Stopped", "conditions": []any{cond("Ready", metav1.ConditionTrue, "Paused", "Pipeline is paused")}},
			wantState:  dataplanev1.Pipeline_STATE_STARTING,
		},
		{
			name:      "unknown phase",
			status:    map[string]any{"observedGeneration": int64(2), "phase": "Unknown"},
			wantState: dataplanev1.Pipeline_STATE_UNSPECIFIED,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			obj := pipelineObj("p", nil, map[string]any{"configYaml": "x", "paused": tc.paused}, tc.status)
			if tc.generation != 0 {
				obj.SetGeneration(tc.generation)
			}
			cr, err := fromUnstructured(obj)
			require.NoError(t, err)

			p := pipelineToProto(cr)
			assert.Equal(t, tc.wantState, p.GetState())
			assert.Equal(t, tc.wantError, p.GetStatus().GetError())
		})
	}
}

// forbiddenSpecFields can run arbitrary pods or read Secrets; Console must never write them.
var forbiddenSpecFields = []string{
	"image", "extraInitContainers", "extraVolumes", "extraVolumeMounts", "serviceAccountName",
	"valueSources", "affinity", "nodeSelector", "tolerations", "annotations", "configFiles",
	"replicas",
}

// assertSafeSubset checks obj against the guard and, independently, that
// spec.cluster and spec.userRef are exactly the configured ones (absent when
// none is configured).
func assertSafeSubset(t *testing.T, obj *unstructured.Unstructured, clusterRef, userRef string) {
	t.Helper()
	require.NoError(t, checkSafeSubset(obj, clusterRef, userRef))
	spec, _, err := unstructured.NestedMap(obj.Object, "spec")
	require.NoError(t, err)
	for _, f := range forbiddenSpecFields {
		assert.NotContains(t, spec, f)
	}
	for k := range spec {
		assert.Contains(t, safeSpecFields, k)
	}
	if clusterRef == "" {
		assert.NotContains(t, spec, "cluster")
	} else {
		assert.Equal(t, map[string]any{"clusterRef": map[string]any{"name": clusterRef}}, spec["cluster"])
	}
	if userRef == "" {
		assert.NotContains(t, spec, "userRef")
	} else {
		assert.Equal(t, map[string]any{"name": userRef}, spec["userRef"])
	}
}

func TestDesiredPipelineToUnstructured(t *testing.T) {
	d := desiredPipeline{
		name: "orders-abc12", namespace: "pipelines", createdBy: "alice",
		displayName: "Orders", configYAML: "input: {}",
		tags: map[string]string{"team": "data", "__redpanda_cloud_pipeline_type": "pipeline"},
		cpu:  "100m", clusterRef: "redpanda", userRef: "connect",
	}
	obj := d.toUnstructured()
	assertSafeSubset(t, obj, "redpanda", "connect")
	tags, _, _ := unstructured.NestedStringMap(obj.Object, "spec", "tags")
	assert.Equal(t, map[string]string{"team": "data"}, tags, "UI-internal Cloud tags aren't persisted")

	assert.Equal(t, "cluster.redpanda.com/v1alpha2", obj.GetAPIVersion())
	assert.Equal(t, "Pipeline", obj.GetKind())
	assert.Equal(t, map[string]string{managedByLabel: managedByValue}, obj.GetLabels())
	assert.Equal(t, map[string]string{createdByAnnotation: "alice"}, obj.GetAnnotations())
	assert.Empty(t, obj.GetResourceVersion())

	cpu, _, _ := unstructured.NestedString(obj.Object, "spec", "resources", "requests", "cpu")
	assert.Equal(t, "100m", cpu)
	_, hasMemory, _ := unstructured.NestedFieldNoCopy(obj.Object, "spec", "resources", "requests", "memory")
	assert.False(t, hasMemory)
	paused, found, _ := unstructured.NestedBool(obj.Object, "spec", "paused")
	assert.True(t, found, "paused is always applied so Console keeps owning it")
	assert.False(t, paused)
}

func TestCheckSafeSubsetRejectsForbiddenFields(t *testing.T) {
	for _, f := range forbiddenSpecFields {
		t.Run(f, func(t *testing.T) {
			obj := desiredPipeline{name: "p", namespace: "ns", displayName: "ppp", configYAML: "x"}.toUnstructured()
			require.NoError(t, unstructured.SetNestedField(obj.Object, "x", "spec", f))
			assert.Error(t, checkSafeSubset(obj, "rp", "connect"))
		})
	}

	t.Run("resource limits", func(t *testing.T) {
		obj := desiredPipeline{name: "p", namespace: "ns", configYAML: "x"}.toUnstructured()
		require.NoError(t, unstructured.SetNestedField(obj.Object, "1", "spec", "resources", "limits", "cpu"))
		assert.Error(t, checkSafeSubset(obj, "", ""))
	})
}

func TestCheckSafeSubsetClusterRef(t *testing.T) {
	testCases := []struct {
		name       string
		configured string
		cluster    any
		wantErr    bool
	}{
		{name: "configured cluster", configured: "rp", cluster: map[string]any{"clusterRef": map[string]any{"name": "rp"}}},
		{name: "not configured", configured: "", cluster: map[string]any{"clusterRef": map[string]any{"name": "rp"}}, wantErr: true},
		{name: "other cluster", configured: "rp", cluster: map[string]any{"clusterRef": map[string]any{"name": "other"}}, wantErr: true},
		{name: "extra clusterRef key", configured: "rp", cluster: map[string]any{"clusterRef": map[string]any{"name": "rp", "namespace": "ns2"}}, wantErr: true},
		{name: "static configuration", configured: "rp", cluster: map[string]any{"clusterRef": map[string]any{"name": "rp"}, "staticConfiguration": map[string]any{}}, wantErr: true},
		{name: "not an object", configured: "rp", cluster: "rp", wantErr: true},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			obj := desiredPipeline{name: "p", namespace: "ns", configYAML: "x"}.toUnstructured()
			require.NoError(t, unstructured.SetNestedField(obj.Object, tc.cluster, "spec", "cluster"))
			err := checkSafeSubset(obj, tc.configured, "")
			if tc.wantErr {
				assert.ErrorContains(t, err, "spec.cluster")
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestCheckSafeSubsetUserRef(t *testing.T) {
	testCases := []struct {
		name       string
		configured string
		userRef    any
		wantErr    bool
	}{
		{name: "configured user", configured: "connect", userRef: map[string]any{"name": "connect"}},
		{name: "not configured", configured: "", userRef: map[string]any{"name": "connect"}, wantErr: true},
		{name: "other user", configured: "connect", userRef: map[string]any{"name": "admin"}, wantErr: true},
		{name: "extra key", configured: "connect", userRef: map[string]any{"name": "connect", "namespace": "other"}, wantErr: true},
		{name: "empty name", configured: "connect", userRef: map[string]any{"name": ""}, wantErr: true},
		{name: "empty object", configured: "connect", userRef: map[string]any{}, wantErr: true},
		{name: "not an object", configured: "connect", userRef: "connect", wantErr: true},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			obj := desiredPipeline{name: "p", namespace: "ns", configYAML: "x", clusterRef: "rp"}.toUnstructured()
			require.NoError(t, unstructured.SetNestedField(obj.Object, tc.userRef, "spec", "userRef"))
			err := checkSafeSubset(obj, "rp", tc.configured)
			if tc.wantErr {
				assert.ErrorContains(t, err, "spec.userRef")
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestUnmanageableSpecFields(t *testing.T) {
	testCases := []struct {
		name string
		spec map[string]any
		want []string
	}{
		{name: "console fields and CRD defaults", spec: map[string]any{
			"configYaml": "x", "displayName": "d", "description": "d", "tags": map[string]any{"a": "b"}, "paused": true,
			"resources": map[string]any{"requests": map[string]any{"cpu": "1"}, "limits": map[string]any{"cpu": "2"}},
			"cluster":   map[string]any{"clusterRef": map[string]any{"name": "other"}},
			"userRef":   map[string]any{"name": "other"},
			"replicas":  int64(1), "updateStrategy": "Recreate",
		}},
		{name: "privileged fields", spec: map[string]any{
			"configYaml": "x", "image": "custom:1", "serviceAccountName": "admin",
			"valueSources": []any{map[string]any{"name": "S"}},
		}, want: []string{"spec.image", "spec.serviceAccountName", "spec.valueSources"}},
		{name: "static cluster configuration", spec: map[string]any{
			"configYaml": "x", "cluster": map[string]any{"staticConfiguration": map[string]any{}},
		}, want: []string{"spec.cluster"}},
		{name: "cluster ref namespace", spec: map[string]any{
			"configYaml": "x", "cluster": map[string]any{"clusterRef": map[string]any{"name": "rp", "namespace": "ns2"}},
		}, want: []string{"spec.cluster"}},
		{name: "userRef extra key", spec: map[string]any{
			"configYaml": "x", "userRef": map[string]any{"name": "u", "namespace": "ns2"},
		}, want: []string{"spec.userRef"}},
		{name: "resource claims", spec: map[string]any{
			"configYaml": "x", "resources": map[string]any{"claims": []any{}},
		}, want: []string{"spec.resources"}},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, unmanageableSpecFields(pipelineObj("p", nil, tc.spec, nil)))
		})
	}
}

func TestNameFromDisplayName(t *testing.T) {
	testCases := []struct {
		displayName string
		want        string
	}{
		{"My Pipeline", "my-pipeline-x7k2q"},
		{"orders_to/s3  v2", "orders-to-s3-v2-x7k2q"},
		{"---", "pipeline-x7k2q"},
		{"123 numbers first", "pipeline-123-numbers-first-x7k2q"},
		{strings.Repeat("a", 128), strings.Repeat("a", maxSlugLen) + "-x7k2q"},
		{strings.Repeat("ab-", 40), strings.TrimRight(strings.Repeat("ab-", 40)[:maxSlugLen], "-") + "-x7k2q"},
		{"9" + strings.Repeat("b", 127), "pipeline-9" + strings.Repeat("b", maxSlugLen-len("pipeline-9")) + "-x7k2q"},
	}
	for _, tc := range testCases {
		t.Run(tc.displayName, func(t *testing.T) {
			got := nameFromDisplayName(tc.displayName, "x7k2q")
			assert.Equal(t, tc.want, got)
			assert.Empty(t, validation.IsDNS1035Label(got))
		})
	}
}
