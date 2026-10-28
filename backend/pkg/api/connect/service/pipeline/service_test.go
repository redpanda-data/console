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
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strconv"
	"strings"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/validation"
	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"

	"github.com/redpanda-data/console/backend/pkg/config"
	kubernetesfactory "github.com/redpanda-data/console/backend/pkg/factory/kubernetes"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

const validConfig = `input:
  generate:
    mapping: root = "hello"
    interval: 1s
output:
  drop: {}
`

const duplicateLabelConfig = `input:
  label: a
  generate:
    mapping: root = 1
pipeline:
  processors:
    - label: a
      mapping: root = 1
`

// operatorStyleConfig relies on the operator: it injects seed_brokers/TLS/SASL into
// redpanda inputs and outputs and projects valueSources as env vars in the pod.
const operatorStyleConfig = `input:
  redpanda:
    topics: [orders]
    consumer_group: orders-to-s3
pipeline:
  processors:
    - mapping: root.source = "${ORDERS_SOURCE}"
output:
  some_newer_output:
    bucket: orders
`

type staticClients struct{ cl dynamic.Interface }

func (s staticClients) GetDynamicClient(context.Context) (dynamic.Interface, error) { return s.cl, nil }

type testEnv struct {
	svc     *Service
	client  *dynamicfake.FakeDynamicClient
	applied []*unstructured.Unstructured
	logs    *bytes.Buffer
}

func newTestEnv(t *testing.T, objs ...runtime.Object) *testEnv {
	t.Helper()
	return newTestEnvWithConfig(t, config.PipelinesKubernetes{Enabled: true, Namespace: "pipelines", ClusterRef: "redpanda", AllowBootstrapUser: true}, objs...)
}

func newTestEnvWithConfig(t *testing.T, cfg config.PipelinesKubernetes, objs ...runtime.Object) *testEnv {
	t.Helper()
	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(),
		map[schema.GroupVersionResource]string{pipelineGVR: "PipelineList"}, objs...)
	logs := &bytes.Buffer{}
	svc, err := NewService(cfg, slog.New(slog.NewJSONHandler(logs, nil)), staticClients{cl: client})
	require.NoError(t, err)

	env := &testEnv{svc: svc, client: client, logs: logs}
	svc.newSuffix = func() string { return "x7k2q" }
	// The fake can't server-side apply, so record the object and echo it back.
	svc.apply = func(_ context.Context, _ dynamic.ResourceInterface, obj *unstructured.Unstructured) (*unstructured.Unstructured, error) {
		env.applied = append(env.applied, obj.DeepCopy())
		return obj.DeepCopy(), nil
	}
	return env
}

// created returns the objects Console POSTed, in order.
func (e *testEnv) created(t *testing.T) []*unstructured.Unstructured {
	t.Helper()
	var out []*unstructured.Unstructured
	for _, a := range e.client.Actions() {
		if c, ok := a.(k8stesting.CreateActionImpl); ok {
			assert.Equal(t, fieldManager, c.CreateOptions.FieldManager)
			out = append(out, c.GetObject().(*unstructured.Unstructured).DeepCopy())
		}
	}
	return out
}

// logLines returns the JSON log records with the given message.
func (e *testEnv) logLines(t *testing.T, msg string) []map[string]any {
	t.Helper()
	var out []map[string]any
	for line := range strings.Lines(e.logs.String()) {
		var rec map[string]any
		require.NoError(t, json.Unmarshal([]byte(line), &rec))
		if rec["msg"] == msg {
			out = append(out, rec)
		}
	}
	return out
}

func consoleOwned(name string, spec map[string]any) *unstructured.Unstructured {
	obj := pipelineObj(name, map[string]any{managedByLabel: managedByValue}, spec, nil)
	obj.SetAnnotations(map[string]string{createdByAnnotation: "alice"})
	return obj
}

func createReq(p *dataplanev1.PipelineCreate) *connect.Request[v1alpha1.CreatePipelineRequest] {
	return connect.NewRequest(&v1alpha1.CreatePipelineRequest{Request: &dataplanev1.CreatePipelineRequest{Pipeline: p}})
}

func TestCreatePipeline(t *testing.T) {
	env := newTestEnv(t)
	ctx := kubernetesfactory.ContextWithUserName(context.Background(), "alice@example.com")

	res, err := env.svc.CreatePipeline(ctx, createReq(&dataplanev1.PipelineCreate{
		DisplayName: "My Orders Pipeline",
		Description: "orders",
		ConfigYaml:  validConfig,
		Resources:   &dataplanev1.Pipeline_Resources{MemoryShares: "0", CpuShares: "100m"},
		Tags:        map[string]string{"__redpanda_cloud_pipeline_type": "pipeline", "team": "data"},
		// Ignored: never written to the CR.
		ServiceAccount: &dataplanev1.Pipeline_ServiceAccount{ClientId: "x"},
	}))
	require.NoError(t, err)
	assert.Empty(t, env.applied, "create POSTs; server-side apply is for updates")
	created := env.created(t)
	require.Len(t, created, 1)

	obj := created[0]
	assertSafeSubset(t, obj, "redpanda", "")
	assert.Equal(t, "my-orders-pipeline-x7k2q", obj.GetName())
	assert.Empty(t, validation.IsDNS1123Subdomain(obj.GetName()))
	assert.Equal(t, "pipelines", obj.GetNamespace())
	assert.Equal(t, managedByValue, obj.GetLabels()[managedByLabel])
	assert.Equal(t, "alice@example.com", obj.GetAnnotations()[createdByAnnotation])

	ref, _, _ := unstructured.NestedString(obj.Object, "spec", "cluster", "clusterRef", "name")
	assert.Equal(t, "redpanda", ref)
	requests, _, _ := unstructured.NestedStringMap(obj.Object, "spec", "resources", "requests")
	assert.Equal(t, map[string]string{"cpu": "100m"}, requests, `memory "0" means unset`)
	tags, _, _ := unstructured.NestedStringMap(obj.Object, "spec", "tags")
	assert.Equal(t, map[string]string{"team": "data"}, tags, "UI-internal Cloud tags aren't persisted")

	p := res.Msg.GetResponse().GetPipeline()
	assert.Equal(t, "my-orders-pipeline-x7k2q", p.GetId())
	assert.Equal(t, "My Orders Pipeline", p.GetDisplayName())

	audit := env.logLines(t, "pipeline changed")
	require.Len(t, audit, 1)
	assert.Equal(t, "create", audit[0]["action"])
	assert.Equal(t, "my-orders-pipeline-x7k2q", audit[0]["pipeline_id"])
	assert.Equal(t, "alice@example.com", audit[0]["user"])
}

// A POST records Console's fields under an Update entry, which server-side
// apply never prunes, so create converts it to an Apply entry.
func TestCreatePipelineMovesFieldsToApplyManager(t *testing.T) {
	env := newTestEnv(t)
	env.client.PrependReactor("create", "pipelines", func(a k8stesting.Action) (bool, runtime.Object, error) {
		obj := a.(k8stesting.CreateAction).GetObject().(*unstructured.Unstructured).DeepCopy()
		obj.SetResourceVersion("1")
		obj.SetManagedFields([]metav1.ManagedFieldsEntry{{
			Manager: fieldManager, Operation: metav1.ManagedFieldsOperationUpdate,
			APIVersion: pipelineGVR.GroupVersion().String(), FieldsType: "FieldsV1",
			FieldsV1: &metav1.FieldsV1{Raw: []byte(`{"f:spec":{"f:configYaml":{},"f:description":{}}}`)},
		}})
		return true, obj, nil
	})
	var patch k8stesting.PatchActionImpl
	env.client.PrependReactor("patch", "pipelines", func(a k8stesting.Action) (bool, runtime.Object, error) {
		var ok bool
		patch, ok = a.(k8stesting.PatchActionImpl)
		require.True(t, ok)
		return true, pipelineObj(patch.Name, map[string]any{managedByLabel: managedByValue}, map[string]any{"configYaml": validConfig}, nil), nil
	})

	_, err := env.svc.CreatePipeline(context.Background(), createReq(&dataplanev1.PipelineCreate{DisplayName: "orders", Description: "d", ConfigYaml: validConfig}))
	require.NoError(t, err)

	assert.Equal(t, "orders-x7k2q", patch.Name)
	assert.Equal(t, types.JSONPatchType, patch.PatchType)
	var ops []struct {
		Path  string          `json:"path"`
		Value json.RawMessage `json:"value"`
	}
	require.NoError(t, json.Unmarshal(patch.Patch, &ops))
	require.Len(t, ops, 2)
	assert.Equal(t, "/metadata/managedFields", ops[0].Path)
	var entries []metav1.ManagedFieldsEntry
	require.NoError(t, json.Unmarshal(ops[0].Value, &entries))
	require.Len(t, entries, 1)
	assert.Equal(t, fieldManager, entries[0].Manager)
	assert.Equal(t, metav1.ManagedFieldsOperationApply, entries[0].Operation)
	assert.Equal(t, "/metadata/resourceVersion", ops[1].Path, "guarded by the created resourceVersion")
}

func TestCreatePipelineAcceptsOperatorStyleConfig(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.svc.CreatePipeline(context.Background(), createReq(&dataplanev1.PipelineCreate{DisplayName: "orders", ConfigYaml: operatorStyleConfig}))
	require.NoError(t, err, "schema-dependent and env-var lints must not block writes")
	require.Len(t, env.created(t), 1)
}

func TestCreatePipelineRetriesTakenName(t *testing.T) {
	env := newTestEnv(t, pipelineObj("orders-taken", nil, map[string]any{"configYaml": "x"}, nil))
	suffixes := []string{"taken", "fresh"}
	env.svc.newSuffix = func() string {
		s := suffixes[0]
		suffixes = suffixes[1:]
		return s
	}

	res, err := env.svc.CreatePipeline(context.Background(), createReq(&dataplanev1.PipelineCreate{DisplayName: "orders", ConfigYaml: validConfig}))
	require.NoError(t, err)
	assert.Equal(t, "orders-fresh", res.Msg.GetResponse().GetPipeline().GetId())
	created := env.created(t)
	require.Len(t, created, 2, "the taken name fails atomically, then the next suffix is used")

	taken, err := env.client.Resource(pipelineGVR).Namespace("pipelines").Get(context.Background(), "orders-taken", metav1.GetOptions{})
	require.NoError(t, err)
	assert.Empty(t, taken.GetLabels(), "the existing CR isn't adopted")
}

func TestCreatePipelineRejectsInvalidInput(t *testing.T) {
	testCases := []struct {
		name     string
		pipeline *dataplanev1.PipelineCreate
	}{
		{name: "duplicate label", pipeline: &dataplanev1.PipelineCreate{DisplayName: "bad", ConfigYaml: duplicateLabelConfig}},
		{name: "bad label", pipeline: &dataplanev1.PipelineCreate{DisplayName: "bad", ConfigYaml: "input:\n  label: \"Bad Label!\"\n  generate:\n    mapping: root = 1\n"}},
		{name: "unparseable yaml", pipeline: &dataplanev1.PipelineCreate{DisplayName: "bad", ConfigYaml: "input: [\n"}},
		{name: "bad quantity", pipeline: &dataplanev1.PipelineCreate{DisplayName: "bad", ConfigYaml: validConfig, Resources: &dataplanev1.Pipeline_Resources{CpuShares: "lots"}}},
		{name: "negative quantity", pipeline: &dataplanev1.PipelineCreate{DisplayName: "bad", ConfigYaml: validConfig, Resources: &dataplanev1.Pipeline_Resources{MemoryShares: "-1Gi"}}},
		{name: "denied component", pipeline: &dataplanev1.PipelineCreate{DisplayName: "bad", ConfigYaml: "input:\n  file:\n    paths: [/var/run/secrets/kubernetes.io/serviceaccount/token]\noutput:\n  drop: {}\n"}},
		{name: "draft", pipeline: &dataplanev1.PipelineCreate{DisplayName: "bad", ConfigYaml: validConfig, Draft: true}},
		{name: "missing pipeline", pipeline: nil},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			env := newTestEnv(t)
			_, err := env.svc.CreatePipeline(context.Background(), createReq(tc.pipeline))
			assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			assert.Empty(t, env.created(t))
		})
	}
}

func TestMutationsRefuseNonConsolePipelines(t *testing.T) {
	gitops := pipelineObj("gitops-managed", map[string]any{"app.kubernetes.io/managed-by": "argocd"}, map[string]any{"configYaml": validConfig}, nil)

	testCases := []struct {
		name string
		call func(svc *Service) error
	}{
		{name: "update", call: func(svc *Service) error {
			_, err := svc.UpdatePipeline(context.Background(), connect.NewRequest(&v1alpha1.UpdatePipelineRequest{
				Request: &dataplanev1.UpdatePipelineRequest{Id: "gitops-managed", Pipeline: &dataplanev1.PipelineUpdate{DisplayName: "new", ConfigYaml: validConfig}},
			}))
			return err
		}},
		{name: "delete", call: func(svc *Service) error {
			_, err := svc.DeletePipeline(context.Background(), connect.NewRequest(&v1alpha1.DeletePipelineRequest{
				Request: &dataplanev1.DeletePipelineRequest{Id: "gitops-managed"},
			}))
			return err
		}},
		{name: "stop", call: func(svc *Service) error {
			_, err := svc.StopPipeline(context.Background(), connect.NewRequest(&v1alpha1.StopPipelineRequest{
				Request: &dataplanev1.StopPipelineRequest{Id: "gitops-managed"},
			}))
			return err
		}},
		{name: "start", call: func(svc *Service) error {
			_, err := svc.StartPipeline(context.Background(), connect.NewRequest(&v1alpha1.StartPipelineRequest{
				Request: &dataplanev1.StartPipelineRequest{Id: "gitops-managed"},
			}))
			return err
		}},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			env := newTestEnv(t, gitops.DeepCopy())
			err := tc.call(env.svc)
			require.Error(t, err)
			assert.Equal(t, connect.CodeFailedPrecondition, connect.CodeOf(err))
			assert.Contains(t, err.Error(), "managed outside Console")
			assert.NotContains(t, err.Error(), managedByLabel, "users aren't told to add the label")
			assert.Empty(t, env.applied)

			_, getErr := env.client.Resource(pipelineGVR).Namespace("pipelines").Get(context.Background(), "gitops-managed", metav1.GetOptions{})
			assert.NoError(t, getErr, "the CR must still exist")
		})
	}
}

// mutations calls every RPC that writes or deletes the pipeline "orders-abc12".
var mutations = []struct {
	name string
	call func(svc *Service) error
}{
	{name: "update", call: func(svc *Service) error {
		_, err := svc.UpdatePipeline(context.Background(), connect.NewRequest(&v1alpha1.UpdatePipelineRequest{
			Request: &dataplanev1.UpdatePipelineRequest{Id: "orders-abc12", Pipeline: &dataplanev1.PipelineUpdate{DisplayName: "orders", ConfigYaml: validConfig}},
		}))
		return err
	}},
	{name: "stop", call: func(svc *Service) error {
		_, err := svc.StopPipeline(context.Background(), connect.NewRequest(&v1alpha1.StopPipelineRequest{
			Request: &dataplanev1.StopPipelineRequest{Id: "orders-abc12"},
		}))
		return err
	}},
	{name: "start", call: func(svc *Service) error {
		_, err := svc.StartPipeline(context.Background(), connect.NewRequest(&v1alpha1.StartPipelineRequest{
			Request: &dataplanev1.StartPipelineRequest{Id: "orders-abc12"},
		}))
		return err
	}},
	{name: "delete", call: func(svc *Service) error {
		_, err := svc.DeletePipeline(context.Background(), connect.NewRequest(&v1alpha1.DeletePipelineRequest{
			Request: &dataplanev1.DeletePipelineRequest{Id: "orders-abc12"},
		}))
		return err
	}},
}

// A Console-labeled CR can carry fields another manager wrote; swapping its
// configYaml from Console would hand those pods and Secrets to the editor.
func TestMutationsRefuseUnmanageableFields(t *testing.T) {
	for _, tc := range mutations {
		t.Run(tc.name, func(t *testing.T) {
			env := newTestEnv(t, consoleOwned("orders-abc12", map[string]any{
				"configYaml":   validConfig,
				"image":        "custom:1",
				"valueSources": []any{map[string]any{"name": "S3_SECRET_KEY"}},
			}))
			err := tc.call(env.svc)
			require.Error(t, err)
			assert.Equal(t, connect.CodeFailedPrecondition, connect.CodeOf(err))
			assert.Contains(t, err.Error(), "pipeline orders-abc12 uses fields Console can't manage: spec.image, spec.valueSources; manage it with kubectl")
			assert.Empty(t, env.applied)

			_, getErr := env.client.Resource(pipelineGVR).Namespace("pipelines").Get(context.Background(), "orders-abc12", metav1.GetOptions{})
			assert.NoError(t, getErr, "the CR must still exist")
		})
	}
}

func TestStopPipelineReappliesConsoleFields(t *testing.T) {
	env := newTestEnv(t, consoleOwned("orders-abc12", map[string]any{
		"displayName": "Orders",
		"description": "d",
		"configYaml":  validConfig,
		"tags":        map[string]any{"team": "data"},
		"resources":   map[string]any{"requests": map[string]any{"cpu": "100m"}, "limits": map[string]any{"cpu": "1"}},
		"cluster":     map[string]any{"clusterRef": map[string]any{"name": "other-cluster"}},
		"userRef":     map[string]any{"name": "set-by-kubectl"},
		// CRD-defaulted, so every stored Pipeline has them.
		"replicas":       int64(3),
		"updateStrategy": "Recreate",
	}))

	_, err := env.svc.StopPipeline(kubernetesfactory.ContextWithUserName(context.Background(), "bob"), connect.NewRequest(&v1alpha1.StopPipelineRequest{
		Request: &dataplanev1.StopPipelineRequest{Id: "orders-abc12"},
	}))
	require.NoError(t, err)
	require.Len(t, env.applied, 1)

	obj := env.applied[0]
	// Server-side apply drops fields the manager stops sending, so everything
	// Console owns is sent again; fields owned by others are left out, and the
	// cluster and user always come from config.
	assertSafeSubset(t, obj, "redpanda", "")
	paused, _, _ := unstructured.NestedBool(obj.Object, "spec", "paused")
	assert.True(t, paused)
	spec, _, _ := unstructured.NestedMap(obj.Object, "spec")
	assert.Equal(t, "Orders", spec["displayName"])
	assert.Equal(t, "d", spec["description"])
	assert.Equal(t, validConfig, spec["configYaml"])
	assert.Equal(t, map[string]any{"team": "data"}, spec["tags"])
	assert.Equal(t, map[string]any{"requests": map[string]any{"cpu": "100m"}}, spec["resources"])
	assert.Equal(t, "7", obj.GetResourceVersion(), "apply is guarded by the resourceVersion we checked")
	assert.Equal(t, "alice", obj.GetAnnotations()[createdByAnnotation])

	audit := env.logLines(t, "pipeline changed")
	require.Len(t, audit, 1)
	assert.Equal(t, map[string]any{"action": "stop", "pipeline_id": "orders-abc12", "user": "bob"},
		map[string]any{"action": audit[0]["action"], "pipeline_id": audit[0]["pipeline_id"], "user": audit[0]["user"]})
}

func TestAuditOmitsUnknownUser(t *testing.T) {
	env := newTestEnv(t, consoleOwned("orders-abc12", map[string]any{"configYaml": validConfig}))
	_, err := env.svc.DeletePipeline(context.Background(), connect.NewRequest(&v1alpha1.DeletePipelineRequest{
		Request: &dataplanev1.DeletePipelineRequest{Id: "orders-abc12"},
	}))
	require.NoError(t, err)
	audit := env.logLines(t, "pipeline changed")
	require.Len(t, audit, 1)
	assert.Equal(t, "delete", audit[0]["action"])
	assert.NotContains(t, audit[0], "user")
}

func TestWritesBindConfiguredIdentity(t *testing.T) {
	cfg := config.PipelinesKubernetes{Enabled: true, Namespace: "pipelines", ClusterRef: "redpanda", UserRef: "connect-pipelines"}
	// The stored CR names another cluster and user, e.g. written with kubectl.
	// Console re-binds the configured ones instead of carrying them over.
	existing := func() *unstructured.Unstructured {
		return consoleOwned("orders-abc12", map[string]any{
			"configYaml": validConfig,
			"cluster":    map[string]any{"clusterRef": map[string]any{"name": "other-cluster"}},
			"userRef":    map[string]any{"name": "superuser"},
		})
	}

	t.Run("create", func(t *testing.T) {
		env := newTestEnvWithConfig(t, cfg)
		_, err := env.svc.CreatePipeline(context.Background(), createReq(&dataplanev1.PipelineCreate{
			DisplayName: "orders", ConfigYaml: validConfig,
			ServiceAccount: &dataplanev1.Pipeline_ServiceAccount{ClientId: "superuser"},
		}))
		require.NoError(t, err)
		created := env.created(t)
		require.Len(t, created, 1)
		assertSafeSubset(t, created[0], "redpanda", "connect-pipelines")
	})
	for _, tc := range mutations {
		if tc.name == "delete" {
			continue
		}
		t.Run(tc.name, func(t *testing.T) {
			env := newTestEnvWithConfig(t, cfg, existing())
			require.NoError(t, tc.call(env.svc))
			require.Len(t, env.applied, 1)
			assertSafeSubset(t, env.applied[0], "redpanda", "connect-pipelines")
		})
	}

	t.Run("no clusterRef configured", func(t *testing.T) {
		env := newTestEnvWithConfig(t, config.PipelinesKubernetes{Enabled: true, Namespace: "pipelines"}, existing())
		_, err := env.svc.StopPipeline(context.Background(), connect.NewRequest(&v1alpha1.StopPipelineRequest{
			Request: &dataplanev1.StopPipelineRequest{Id: "orders-abc12"},
		}))
		require.NoError(t, err)
		require.Len(t, env.applied, 1)
		assertSafeSubset(t, env.applied[0], "", "")
	})
}

func TestUpdatePipeline(t *testing.T) {
	existing := map[string]any{
		"displayName": "Orders",
		"description": "old",
		"configYaml":  validConfig,
		"tags":        map[string]any{"team": "data"},
		"resources":   map[string]any{"requests": map[string]any{"cpu": "100m", "memory": "256Mi"}},
		"paused":      true,
	}

	t.Run("full update keeps paused and resources when omitted", func(t *testing.T) {
		env := newTestEnv(t, consoleOwned("orders-abc12", existing))
		_, err := env.svc.UpdatePipeline(context.Background(), connect.NewRequest(&v1alpha1.UpdatePipelineRequest{
			Request: &dataplanev1.UpdatePipelineRequest{Id: "orders-abc12", Pipeline: &dataplanev1.PipelineUpdate{
				DisplayName: "Orders v2",
				ConfigYaml:  validConfig,
			}},
		}))
		require.NoError(t, err)
		require.Len(t, env.applied, 1)
		spec, _, _ := unstructured.NestedMap(env.applied[0].Object, "spec")
		assert.Equal(t, "Orders v2", spec["displayName"])
		assert.NotContains(t, spec, "description")
		assert.NotContains(t, spec, "tags")
		assert.Equal(t, true, spec["paused"])
		assert.Equal(t, map[string]any{"requests": map[string]any{"cpu": "100m", "memory": "256Mi"}}, spec["resources"])
	})

	t.Run("update mask only touches listed fields", func(t *testing.T) {
		env := newTestEnv(t, consoleOwned("orders-abc12", existing))
		_, err := env.svc.UpdatePipeline(context.Background(), connect.NewRequest(&v1alpha1.UpdatePipelineRequest{
			Request: &dataplanev1.UpdatePipelineRequest{
				Id:         "orders-abc12",
				Pipeline:   &dataplanev1.PipelineUpdate{DisplayName: "ignored", Description: "new", Resources: &dataplanev1.Pipeline_Resources{CpuShares: "500m"}},
				UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"description", "resources.cpu_shares"}},
			},
		}))
		require.NoError(t, err)
		spec, _, _ := unstructured.NestedMap(env.applied[0].Object, "spec")
		assert.Equal(t, "Orders", spec["displayName"])
		assert.Equal(t, "new", spec["description"])
		assert.Equal(t, map[string]any{"team": "data"}, spec["tags"])
		assert.Equal(t, map[string]any{"requests": map[string]any{"cpu": "500m", "memory": "256Mi"}}, spec["resources"])
	})

	t.Run("lint failure", func(t *testing.T) {
		env := newTestEnv(t, consoleOwned("orders-abc12", existing))
		_, err := env.svc.UpdatePipeline(context.Background(), connect.NewRequest(&v1alpha1.UpdatePipelineRequest{
			Request: &dataplanev1.UpdatePipelineRequest{Id: "orders-abc12", Pipeline: &dataplanev1.PipelineUpdate{DisplayName: "x", ConfigYaml: duplicateLabelConfig}},
		}))
		assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
		assert.Empty(t, env.applied)
	})

	t.Run("unknown mask path", func(t *testing.T) {
		env := newTestEnv(t, consoleOwned("orders-abc12", existing))
		_, err := env.svc.UpdatePipeline(context.Background(), connect.NewRequest(&v1alpha1.UpdatePipelineRequest{
			Request: &dataplanev1.UpdatePipelineRequest{
				Id: "orders-abc12", Pipeline: &dataplanev1.PipelineUpdate{DisplayName: "x"},
				UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"image"}},
			},
		}))
		assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	})
}

func TestDeletePipeline(t *testing.T) {
	env := newTestEnv(t, consoleOwned("orders-abc12", map[string]any{"configYaml": validConfig}))
	_, err := env.svc.DeletePipeline(context.Background(), connect.NewRequest(&v1alpha1.DeletePipelineRequest{
		Request: &dataplanev1.DeletePipelineRequest{Id: "orders-abc12"},
	}))
	require.NoError(t, err)

	var deleteAction k8stesting.DeleteActionImpl
	for _, a := range env.client.Actions() {
		if d, ok := a.(k8stesting.DeleteActionImpl); ok {
			deleteAction = d
		}
	}
	require.NotNil(t, deleteAction.DeleteOptions.Preconditions)
	assert.Equal(t, "uid-orders-abc12", string(*deleteAction.DeleteOptions.Preconditions.UID))
	assert.Equal(t, "7", *deleteAction.DeleteOptions.Preconditions.ResourceVersion)

	_, err = env.client.Resource(pipelineGVR).Namespace("pipelines").Get(context.Background(), "orders-abc12", metav1.GetOptions{})
	assert.True(t, k8serrors.IsNotFound(err))
}

func TestGetPipeline(t *testing.T) {
	env := newTestEnv(t, pipelineObj("gitops-managed", nil, map[string]any{"displayName": "GitOps", "configYaml": validConfig}, nil))

	res, err := env.svc.GetPipeline(context.Background(), connect.NewRequest(&v1alpha1.GetPipelineRequest{
		Request: &dataplanev1.GetPipelineRequest{Id: "gitops-managed"},
	}))
	require.NoError(t, err)
	assert.Equal(t, "GitOps", res.Msg.GetResponse().GetPipeline().GetDisplayName())

	_, err = env.svc.GetPipeline(context.Background(), connect.NewRequest(&v1alpha1.GetPipelineRequest{
		Request: &dataplanev1.GetPipelineRequest{Id: "missing"},
	}))
	assert.Equal(t, connect.CodeNotFound, connect.CodeOf(err))

	// "/" would address a subresource such as <name>/scale.
	_, err = env.svc.GetPipeline(context.Background(), connect.NewRequest(&v1alpha1.GetPipelineRequest{
		Request: &dataplanev1.GetPipelineRequest{Id: "gitops-managed/scale"},
	}))
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
}

func TestListPipelines(t *testing.T) {
	running := map[string]any{"observedGeneration": int64(2), "phase": "Running"}
	stopped := map[string]any{"observedGeneration": int64(2), "phase": "Stopped"}
	env := newTestEnv(t,
		pipelineObj("orders", nil, map[string]any{"displayName": "Orders", "configYaml": "x", "tags": map[string]any{"team": "data"}}, running),
		pipelineObj("payments", nil, map[string]any{"displayName": "Payments", "configYaml": "x", "paused": true}, stopped),
	)

	list := func(f *dataplanev1.ListPipelinesRequest_Filter) []string {
		res, err := env.svc.ListPipelines(context.Background(), connect.NewRequest(&v1alpha1.ListPipelinesRequest{
			Request: &dataplanev1.ListPipelinesRequest{PageSize: 500, Filter: f},
		}))
		require.NoError(t, err)
		var ids []string
		for _, p := range res.Msg.GetResponse().GetPipelines() {
			ids = append(ids, p.GetId())
		}
		return ids
	}

	assert.ElementsMatch(t, []string{"orders", "payments"}, list(nil))
	assert.Equal(t, []string{"orders"}, list(&dataplanev1.ListPipelinesRequest_Filter{NameContains: "ORD"}))
	assert.Equal(t, []string{"orders"}, list(&dataplanev1.ListPipelinesRequest_Filter{Tags: map[string]string{"team": "data"}}))
	assert.Equal(t, []string{"payments"}, list(&dataplanev1.ListPipelinesRequest_Filter{States: []dataplanev1.Pipeline_State{dataplanev1.Pipeline_STATE_STOPPED}}))
	assert.Empty(t, list(&dataplanev1.ListPipelinesRequest_Filter{SecretId: "s"}))
}

// pagedList makes the fake client honor Limit and Continue (an item offset).
func pagedList(objs []*unstructured.Unstructured, limits *[]int64) k8stesting.ReactionFunc {
	return func(a k8stesting.Action) (bool, runtime.Object, error) {
		opts := a.(k8stesting.ListActionImpl).ListOptions
		*limits = append(*limits, opts.Limit)
		start := 0
		if opts.Continue != "" {
			start, _ = strconv.Atoi(opts.Continue)
		}
		end := len(objs)
		if opts.Limit > 0 && start+int(opts.Limit) < end {
			end = start + int(opts.Limit)
		}
		list := &unstructured.UnstructuredList{Object: map[string]any{"apiVersion": "cluster.redpanda.com/v1alpha2", "kind": "PipelineList"}}
		for _, o := range objs[start:end] {
			list.Items = append(list.Items, *o.DeepCopy())
		}
		if end < len(objs) {
			list.SetContinue(strconv.Itoa(end))
		}
		return true, list, nil
	}
}

func TestListPipelinesFiltersAcrossPages(t *testing.T) {
	// Every third pipeline matches.
	var objs []*unstructured.Unstructured
	for i := range 10 {
		team := "other"
		if i%3 == 0 {
			team = "data"
		}
		objs = append(objs, pipelineObj("p"+strconv.Itoa(i), nil, map[string]any{"configYaml": "x", "tags": map[string]any{"team": team}}, nil))
	}
	env := newTestEnv(t)
	var limits []int64
	env.client.PrependReactor("list", "pipelines", pagedList(objs, &limits))

	list := func(token string) ([]string, string) {
		res, err := env.svc.ListPipelines(context.Background(), connect.NewRequest(&v1alpha1.ListPipelinesRequest{
			Request: &dataplanev1.ListPipelinesRequest{PageSize: 2, PageToken: token, Filter: &dataplanev1.ListPipelinesRequest_Filter{Tags: map[string]string{"team": "data"}}},
		}))
		require.NoError(t, err)
		var ids []string
		for _, p := range res.Msg.GetResponse().GetPipelines() {
			ids = append(ids, p.GetId())
		}
		return ids, res.Msg.GetResponse().GetNextPageToken()
	}

	ids, token := list("")
	assert.Equal(t, []string{"p0", "p3"}, ids, "a full page despite sparse matches")
	assert.Equal(t, []int64{2, 1, 1}, limits, "never lists more items than matches still fit")
	assert.Equal(t, "4", token)

	ids, token = list(token)
	assert.Equal(t, []string{"p6", "p9"}, ids)
	assert.Empty(t, token, "the list is exhausted")
}

func TestListPipelinesLogsUndecodableOnce(t *testing.T) {
	broken := pipelineObj("broken", nil, map[string]any{"configYaml": int64(5)}, nil)
	env := newTestEnv(t, broken, pipelineObj("orders", nil, map[string]any{"configYaml": "x"}, nil))
	for range 3 {
		res, err := env.svc.ListPipelines(context.Background(), connect.NewRequest(&v1alpha1.ListPipelinesRequest{Request: &dataplanev1.ListPipelinesRequest{}}))
		require.NoError(t, err)
		assert.Len(t, res.Msg.GetResponse().GetPipelines(), 1)
	}
	assert.Len(t, env.logLines(t, "skipping undecodable pipeline"), 1)
}

func TestKubernetesErrorMapping(t *testing.T) {
	gr := pipelineGVR.GroupResource()
	testCases := []struct {
		name string
		err  error
		want connect.Code
		// passThrough means the API server's message reaches the client.
		passThrough bool
	}{
		{name: "401", err: k8serrors.NewUnauthorized("token for system:serviceaccount:ns:console expired"), want: connect.CodeUnauthenticated},
		{name: "403", err: k8serrors.NewForbidden(gr, "p", errors.New(`User "system:serviceaccount:ns:console" cannot patch resource "pipelines"`)), want: connect.CodePermissionDenied},
		{name: "500", err: k8serrors.NewInternalError(errors.New("etcd at 10.0.0.5:2379 unavailable")), want: connect.CodeInternal},
		{name: "404", err: k8serrors.NewNotFound(gr, "p"), want: connect.CodeNotFound, passThrough: true},
		{name: "409 exists", err: k8serrors.NewAlreadyExists(gr, "p"), want: connect.CodeAlreadyExists, passThrough: true},
		{name: "409 conflict", err: k8serrors.NewConflict(gr, "p", nil), want: connect.CodeAborted, passThrough: true},
		{name: "422", err: k8serrors.NewInvalid(schema.GroupKind{Group: "cluster.redpanda.com", Kind: "Pipeline"}, "p", nil), want: connect.CodeInvalidArgument, passThrough: true},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			env := newTestEnv(t, consoleOwned("p", map[string]any{"configYaml": validConfig}))
			env.client.PrependReactor("patch", "pipelines", func(k8stesting.Action) (bool, runtime.Object, error) { return true, nil, tc.err })
			env.svc.apply = serverSideApply

			_, err := env.svc.StopPipeline(context.Background(), connect.NewRequest(&v1alpha1.StopPipelineRequest{
				Request: &dataplanev1.StopPipelineRequest{Id: "p"},
			}))
			assert.Equal(t, tc.want, connect.CodeOf(err))
			if tc.passThrough {
				assert.Contains(t, err.Error(), tc.err.Error(), "API server message is passed through")
				return
			}
			var status k8serrors.APIStatus
			require.ErrorAs(t, tc.err, &status)
			assert.NotContains(t, err.Error(), status.Status().Message, "API server message is only logged")
			assert.Contains(t, err.Error(), string(status.Status().Reason))
			logged := env.logLines(t, "failed to apply pipeline")
			require.Len(t, logged, 1)
			assert.Equal(t, "p", logged[0]["pipeline_id"])
			assert.Contains(t, logged[0]["error"], status.Status().Message)
		})
	}
}

func TestTransportErrorsAreNotPassedThrough(t *testing.T) {
	env := newTestEnv(t)
	env.client.PrependReactor("list", "pipelines", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New(`Get "https://10.0.0.1:443/apis/cluster.redpanda.com/v1alpha2/namespaces/pipelines/pipelines": dial tcp 10.0.0.1:443: connect: connection refused`)
	})
	_, err := env.svc.ListPipelines(context.Background(), connect.NewRequest(&v1alpha1.ListPipelinesRequest{Request: &dataplanev1.ListPipelinesRequest{}}))
	assert.Equal(t, connect.CodeInternal, connect.CodeOf(err))
	assert.NotContains(t, err.Error(), "10.0.0.1")
	assert.Len(t, env.logLines(t, "failed to list pipelines"), 1)
}

func TestExpiredPageToken(t *testing.T) {
	env := newTestEnv(t)
	env.client.PrependReactor("list", "pipelines", func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, k8serrors.NewResourceExpired("The provided continue parameter is too old")
	})
	_, err := env.svc.ListPipelines(context.Background(), connect.NewRequest(&v1alpha1.ListPipelinesRequest{Request: &dataplanev1.ListPipelinesRequest{PageToken: "stale"}}))
	assert.Equal(t, connect.CodeAborted, connect.CodeOf(err))
	assert.Contains(t, err.Error(), "listing expired, restart from the first page")
}

func TestSecretRPCsReturnEmpty(t *testing.T) {
	env := newTestEnv(t)
	forSecret, err := env.svc.GetPipelinesForSecret(context.Background(), connect.NewRequest(&v1alpha1.GetPipelinesForSecretRequest{
		Request: &dataplanev1.GetPipelinesForSecretRequest{SecretId: "S"},
	}))
	require.NoError(t, err)
	assert.Empty(t, forSecret.Msg.GetResponse().GetPipelinesForSecret().GetPipelines())

	bySecrets, err := env.svc.GetPipelinesBySecrets(context.Background(), connect.NewRequest(&v1alpha1.GetPipelinesBySecretsRequest{}))
	require.NoError(t, err)
	assert.Empty(t, bySecrets.Msg.GetResponse().GetPipelinesForSecret())

	schemaRes, err := env.svc.GetPipelineServiceConfigSchema(context.Background(), connect.NewRequest(&v1alpha1.GetPipelineServiceConfigSchemaRequest{}))
	require.NoError(t, err)
	assert.NotEmpty(t, schemaRes.Msg.GetResponse().GetConfigSchema())
}
