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
	"errors"
	"fmt"
	"slices"
	"strings"

	"google.golang.org/protobuf/types/known/timestamppb"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"

	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

const (
	fieldManager        = "redpanda-console"
	managedByLabel      = "console.redpanda.com/managed-by"
	managedByValue      = "console"
	createdByAnnotation = "console.redpanda.com/created-by"

	// cloudTagPrefix marks tags the UI adds for Cloud bookkeeping (for example
	// __redpanda_cloud_pipeline_type). They mean nothing to the operator, so
	// they aren't persisted.
	cloudTagPrefix = "__redpanda_cloud_"
)

// pipelineGVR is the Redpanda Operator's Pipeline custom resource.
var pipelineGVR = schema.GroupVersionResource{Group: "cluster.redpanda.com", Version: "v1alpha2", Resource: "pipelines"}

const pipelineKind = "Pipeline"

// Operator phases and condition reasons, mirrored from the redpanda-operator
// v1alpha2 Pipeline API to avoid importing the operator module.
const (
	phasePending      = "Pending"
	phaseProvisioning = "Provisioning"
	phaseRunning      = "Running"
	phaseStopped      = "Stopped"

	conditionReady       = "Ready"
	conditionConfigValid = "ConfigValid"

	reasonProvisioning = "Provisioning"
	reasonRunning      = "Running"
	reasonPaused       = "Paused"
)

// pipelineCR is the subset of the Pipeline CR that Console reads.
type pipelineCR struct {
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              pipelineSpec   `json:"spec,omitempty"`
	Status            pipelineStatus `json:"status,omitempty"`
}

type pipelineSpec struct {
	DisplayName string             `json:"displayName,omitempty"`
	Description string             `json:"description,omitempty"`
	ConfigYAML  string             `json:"configYaml,omitempty"`
	Tags        map[string]string  `json:"tags,omitempty"`
	Paused      bool               `json:"paused,omitempty"`
	Resources   *pipelineResources `json:"resources,omitempty"`
}

type pipelineResources struct {
	Requests map[string]resource.Quantity `json:"requests,omitempty"`
}

type pipelineStatus struct {
	ObservedGeneration int64              `json:"observedGeneration,omitempty"`
	Phase              string             `json:"phase,omitempty"`
	Conditions         []metav1.Condition `json:"conditions,omitempty"`
}

func fromUnstructured(obj *unstructured.Unstructured) (*pipelineCR, error) {
	var cr pipelineCR
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.UnstructuredContent(), &cr); err != nil {
		return nil, fmt.Errorf("failed to decode pipeline %q: %w", obj.GetName(), err)
	}
	return &cr, nil
}

func isManagedByConsole(cr *pipelineCR) bool {
	return cr.Labels[managedByLabel] == managedByValue
}

func pipelineToProto(cr *pipelineCR) *dataplanev1.Pipeline {
	state, errMsg := pipelineState(cr)
	p := &dataplanev1.Pipeline{
		Id:          cr.Name,
		DisplayName: cr.Spec.DisplayName,
		Description: cr.Spec.Description,
		ConfigYaml:  cr.Spec.ConfigYAML,
		Tags:        cr.Spec.Tags,
		State:       state,
		CreatedBy:   cr.Annotations[createdByAnnotation],
		Resources:   resourcesToProto(cr.Spec.Resources),
	}
	if p.DisplayName == "" {
		p.DisplayName = cr.Name
	}
	if errMsg != "" {
		p.Status = &dataplanev1.Pipeline_Status{Error: errMsg}
	}
	if !cr.CreationTimestamp.IsZero() {
		p.CreateTime = timestamppb.New(cr.CreationTimestamp.Time)
		p.UpdateTime = timestamppb.New(lastUpdate(cr).Time)
	}
	return p
}

func resourcesToProto(r *pipelineResources) *dataplanev1.Pipeline_Resources {
	if r == nil || len(r.Requests) == 0 {
		return nil
	}
	out := &dataplanev1.Pipeline_Resources{}
	if q, ok := r.Requests["cpu"]; ok {
		out.CpuShares = q.String()
	}
	if q, ok := r.Requests["memory"]; ok {
		out.MemoryShares = q.String()
	}
	return out
}

// pipelineState maps the operator's phase and conditions onto the dataplane state.
// When status lags the spec (a Stop or Start not yet reconciled), the transition
// state is reported so the UI doesn't show the previous state.
func pipelineState(cr *pipelineCR) (dataplanev1.Pipeline_State, string) {
	phase := cr.Status.Phase
	errMsg := failureMessage(cr.Status.Conditions)

	if cr.Status.ObservedGeneration < cr.Generation {
		if cr.Spec.Paused && phase != phaseStopped {
			return dataplanev1.Pipeline_STATE_STOPPING, errMsg
		}
		if !cr.Spec.Paused && (phase == phaseStopped || phase == "") {
			return dataplanev1.Pipeline_STATE_STARTING, errMsg
		}
	}

	if ready := findCondition(cr.Status.Conditions, conditionReady); ready != nil &&
		ready.Status == metav1.ConditionFalse && isFailureReason(ready.Reason) {
		return dataplanev1.Pipeline_STATE_ERROR, errMsg
	}

	switch phase {
	case phasePending, phaseProvisioning:
		// A failing lint init container keeps the pod from ever starting.
		if c := findCondition(cr.Status.Conditions, conditionConfigValid); c != nil && c.Status == metav1.ConditionFalse {
			return dataplanev1.Pipeline_STATE_ERROR, errMsg
		}
		return dataplanev1.Pipeline_STATE_STARTING, errMsg
	case phaseRunning:
		return dataplanev1.Pipeline_STATE_RUNNING, errMsg
	case phaseStopped:
		return dataplanev1.Pipeline_STATE_STOPPED, errMsg
	default:
		return dataplanev1.Pipeline_STATE_UNSPECIFIED, errMsg
	}
}

func isFailureReason(reason string) bool {
	switch reason {
	case "", reasonProvisioning, reasonRunning, reasonPaused:
		return false
	default:
		return true
	}
}

// failureMessage prefers the Ready condition's message, then any other False
// condition (ConfigValid, ClusterRef, License, ...), which the operator can
// report while the workload itself keeps running.
func failureMessage(conds []metav1.Condition) string {
	if ready := findCondition(conds, conditionReady); ready != nil &&
		ready.Status == metav1.ConditionFalse && isFailureReason(ready.Reason) {
		return ready.Message
	}
	for _, c := range conds {
		if c.Type != conditionReady && c.Status == metav1.ConditionFalse {
			return c.Message
		}
	}
	return ""
}

func findCondition(conds []metav1.Condition, condType string) *metav1.Condition {
	for i := range conds {
		if conds[i].Type == condType {
			return &conds[i]
		}
	}
	return nil
}

// lastUpdate is the newest spec or metadata write. Status writes (the operator
// reporting progress) don't count.
func lastUpdate(cr *pipelineCR) metav1.Time {
	latest := cr.CreationTimestamp
	for _, mf := range cr.ManagedFields {
		if mf.Subresource == "status" {
			continue
		}
		if mf.Time != nil && mf.Time.After(latest.Time) {
			latest = *mf.Time
		}
	}
	return latest
}

// desiredPipeline is every field Console owns on a Pipeline CR. Each write applies
// all of it, because server-side apply drops fields a manager stops sending.
type desiredPipeline struct {
	name, namespace string
	resourceVersion string
	createdBy       string

	displayName string
	description string
	configYAML  string
	tags        map[string]string
	cpu, memory string
	paused      bool
	clusterRef  string
	userRef     string
}

// safeSpecFields are the only spec fields Console may write. Anything else
// (image, extraInitContainers, extraVolumes, serviceAccountName, valueSources,
// affinity, ...) can run arbitrary pods or read arbitrary Secrets. cluster and
// userRef are only allowed as the configured ones (see checkSafeSubset).
var safeSpecFields = map[string]struct{}{
	"displayName": {},
	"description": {},
	"tags":        {},
	"configYaml":  {},
	"resources":   {},
	"paused":      {},
	"cluster":     {},
	"userRef":     {},
}

// crdDefaultedSpecFields are set on every stored Pipeline by CRD defaulting.
// Console never writes them, but they don't stop it from managing a CR.
var crdDefaultedSpecFields = map[string]struct{}{
	"replicas":       {},
	"updateStrategy": {},
}

// unmanageableSpecFields returns the stored spec fields that keep Console from
// managing a Pipeline. A CR labeled for Console can still carry fields another
// field manager wrote (image, valueSources, serviceAccountName, a
// staticConfiguration cluster, ...); changing its configYaml would hand those
// pods and Secrets to whoever edits it in Console.
func unmanageableSpecFields(obj *unstructured.Unstructured) []string {
	spec, _, err := unstructured.NestedMap(obj.Object, "spec")
	if err != nil {
		return []string{"spec"}
	}
	var out []string
	for k, v := range spec {
		_, safe := safeSpecFields[k]
		_, defaulted := crdDefaultedSpecFields[k]
		switch {
		case !safe && !defaulted:
			out = append(out, "spec."+k)
		case k == "cluster":
			cluster, ok := v.(map[string]any)
			if !ok || !hasOnlyKeys(cluster, "clusterRef") || !hasOnlyKeys(cluster["clusterRef"], "name") {
				out = append(out, "spec.cluster")
			}
		case k == "userRef":
			if !hasOnlyKeys(v, "name") {
				out = append(out, "spec.userRef")
			}
		case k == "resources":
			if !hasOnlyKeys(v, "requests", "limits") {
				out = append(out, "spec.resources")
			}
		}
	}
	slices.Sort(out)
	return out
}

// hasOnlyKeys reports whether v is a map whose keys are all in keys.
func hasOnlyKeys(v any, keys ...string) bool {
	m, ok := v.(map[string]any)
	if !ok {
		return false
	}
	for k := range m {
		if !slices.Contains(keys, k) {
			return false
		}
	}
	return true
}

// desiredFromCR copies the fields Console owns from a stored CR. Identity
// (clusterRef, userRef) isn't copied: write always takes it from config.
func desiredFromCR(cr *pipelineCR) desiredPipeline {
	d := desiredPipeline{
		name:            cr.Name,
		namespace:       cr.Namespace,
		resourceVersion: cr.ResourceVersion,
		createdBy:       cr.Annotations[createdByAnnotation],
		displayName:     cr.Spec.DisplayName,
		description:     cr.Spec.Description,
		configYAML:      cr.Spec.ConfigYAML,
		tags:            cr.Spec.Tags,
		paused:          cr.Spec.Paused,
	}
	if r := resourcesToProto(cr.Spec.Resources); r != nil {
		d.cpu, d.memory = r.CpuShares, r.MemoryShares
	}
	return d
}

func (d desiredPipeline) toUnstructured() *unstructured.Unstructured {
	spec := map[string]any{
		"configYaml": d.configYAML,
		"paused":     d.paused,
	}
	if d.displayName != "" {
		spec["displayName"] = d.displayName
	}
	if d.description != "" {
		spec["description"] = d.description
	}
	tags := make(map[string]any, len(d.tags))
	for k, v := range d.tags {
		if !strings.HasPrefix(k, cloudTagPrefix) {
			tags[k] = v
		}
	}
	if len(tags) > 0 {
		spec["tags"] = tags
	}
	requests := map[string]any{}
	if d.cpu != "" {
		requests["cpu"] = d.cpu
	}
	if d.memory != "" {
		requests["memory"] = d.memory
	}
	if len(requests) > 0 {
		spec["resources"] = map[string]any{"requests": requests}
	}
	if d.clusterRef != "" {
		spec["cluster"] = map[string]any{"clusterRef": map[string]any{"name": d.clusterRef}}
	}
	if d.userRef != "" {
		spec["userRef"] = map[string]any{"name": d.userRef}
	}

	metadata := map[string]any{
		"name":      d.name,
		"namespace": d.namespace,
		"labels":    map[string]any{managedByLabel: managedByValue},
	}
	if d.resourceVersion != "" {
		// Optimistic concurrency: the apply fails if the CR changed since we
		// checked its managed-by label.
		metadata["resourceVersion"] = d.resourceVersion
	}
	if d.createdBy != "" {
		metadata["annotations"] = map[string]any{createdByAnnotation: d.createdBy}
	}

	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": pipelineGVR.GroupVersion().String(),
		"kind":       pipelineKind,
		"metadata":   metadata,
		"spec":       spec,
	}}
}

// checkSafeSubset is a last line of defense before any write leaves Console.
// clusterRef and userRef are the configured pipelines.kubernetes values; they're
// the only cluster and user Console may bind a pipeline to.
func checkSafeSubset(obj *unstructured.Unstructured, clusterRef, userRef string) error {
	spec, _, err := unstructured.NestedMap(obj.Object, "spec")
	if err != nil {
		return fmt.Errorf("invalid pipeline spec: %w", err)
	}
	for k := range spec {
		if _, ok := safeSpecFields[k]; !ok {
			return fmt.Errorf("refusing to write pipeline field spec.%s", k)
		}
	}
	if err := checkClusterRef(spec, clusterRef); err != nil {
		return err
	}
	if err := checkUserRef(spec, userRef); err != nil {
		return err
	}
	if res, found := spec["resources"]; found {
		resMap, ok := res.(map[string]any)
		if !ok {
			return errors.New("invalid pipeline field spec.resources")
		}
		for k := range resMap {
			if k != "requests" {
				return fmt.Errorf("refusing to write pipeline field spec.resources.%s", k)
			}
		}
	}
	return nil
}

// checkClusterRef allows spec.cluster only as exactly {clusterRef: {name: <configured clusterRef>}}.
func checkClusterRef(spec map[string]any, clusterRef string) error {
	cluster, found := spec["cluster"]
	if !found {
		return nil
	}
	errOther := errors.New("refusing to write pipeline field spec.cluster other than the configured pipelines.kubernetes.clusterRef")
	clusterMap, ok := cluster.(map[string]any)
	if !ok || clusterRef == "" || len(clusterMap) != 1 {
		return errOther
	}
	ref, ok := clusterMap["clusterRef"].(map[string]any)
	if !ok || len(ref) != 1 || ref["name"] != clusterRef {
		return errOther
	}
	return nil
}

// checkUserRef allows spec.userRef only as exactly {name: <configured userRef>}.
func checkUserRef(spec map[string]any, userRef string) error {
	ref, found := spec["userRef"]
	if !found {
		return nil
	}
	refMap, ok := ref.(map[string]any)
	if userRef == "" || !ok || len(refMap) != 1 || refMap["name"] != userRef {
		return errors.New("refusing to write pipeline field spec.userRef other than the configured pipelines.kubernetes.userRef")
	}
	return nil
}
