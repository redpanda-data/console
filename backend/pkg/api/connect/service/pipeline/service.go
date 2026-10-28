// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package pipeline implements the Console PipelineService on top of the Redpanda
// Operator's Pipeline custom resource, for self-hosted Console on Kubernetes.
package pipeline

import (
	"context"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"sync"

	"connectrpc.com/connect"
	"github.com/redpanda-data/benthos/v4/public/service"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/rand"
	"k8s.io/apimachinery/pkg/util/sets"
	"k8s.io/apimachinery/pkg/util/validation"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/util/csaupgrade"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	kubernetesfactory "github.com/redpanda-data/console/backend/pkg/factory/kubernetes"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	"github.com/redpanda-data/console/backend/pkg/rpconnect"
)

var _ consolev1alpha1connect.PipelineServiceHandler = (*Service)(nil)

const (
	defaultPageSize   = 100
	maxCreateAttempts = 3
)

// applyFunc server-side applies a Pipeline. It's a seam for tests, since the
// dynamic fake client doesn't implement server-side apply.
type applyFunc func(ctx context.Context, ri dynamic.ResourceInterface, obj *unstructured.Unstructured) (*unstructured.Unstructured, error)

func serverSideApply(ctx context.Context, ri dynamic.ResourceInterface, obj *unstructured.Unstructured) (*unstructured.Unstructured, error) {
	// Force is safe: updates only target existing Console-labeled CRs, and the
	// resourceVersion in obj makes the apply fail if the CR changed since.
	return ri.Apply(ctx, obj.GetName(), obj, metav1.ApplyOptions{FieldManager: fieldManager, Force: true})
}

// Service serves PipelineService from Pipeline CRs in a single namespace.
type Service struct {
	logger    *slog.Logger
	cfg       config.PipelinesKubernetes
	clients   kubernetesfactory.ClientFactory
	linter    *rpconnect.Linter
	apply     applyFunc
	newSuffix func() string

	// undecodable remembers the CR versions already logged as undecodable, so
	// list polling logs a broken CR once instead of on every request.
	undecodable sync.Map
}

// NewService creates a Kubernetes-backed PipelineService.
func NewService(cfg config.PipelinesKubernetes, logger *slog.Logger, clients kubernetesfactory.ClientFactory) (*Service, error) {
	linter, err := rpconnect.NewLinter()
	if err != nil {
		return nil, fmt.Errorf("failed to create redpanda connect linter: %w", err)
	}
	return &Service{
		logger:    logger,
		cfg:       cfg,
		clients:   clients,
		linter:    linter,
		apply:     serverSideApply,
		newSuffix: func() string { return rand.String(suffixLen) },
	}, nil
}

// ListPipelines lists Pipeline CRs in the configured namespace.
func (s *Service) ListPipelines(ctx context.Context, req *connect.Request[v1alpha1.ListPipelinesRequest]) (*connect.Response[v1alpha1.ListPipelinesResponse], error) {
	r := req.Msg.GetRequest()
	if r.GetFilter().GetSecretId() != "" {
		// Secrets are out of scope, so no pipeline references one.
		return connect.NewResponse(&v1alpha1.ListPipelinesResponse{Response: &dataplanev1.ListPipelinesResponse{}}), nil
	}
	ri, err := s.pipelines(ctx)
	if err != nil {
		return nil, err
	}

	var pageSize int64
	switch size := r.GetPageSize(); {
	case size > 0:
		pageSize = int64(size)
	case size == 0:
		pageSize = defaultPageSize
	}
	pipelines, next, err := s.listPage(ctx, ri, r.GetFilter(), r.GetPageToken(), pageSize)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&v1alpha1.ListPipelinesResponse{Response: &dataplanev1.ListPipelinesResponse{
		Pipelines:     pipelines,
		NextPageToken: next,
	}}), nil
}

// listPage returns up to pageSize (0 is unlimited) pipelines matching f and
// the token for the next page. Filters run in Console, after Kubernetes
// pagination, so with a filter it keeps listing until the page is full or the
// list ends, never asking for more items than matches still fit, so the
// continue token skips nothing.
func (s *Service) listPage(ctx context.Context, ri dynamic.ResourceInterface, f *dataplanev1.ListPipelinesRequest_Filter, token string, pageSize int64) ([]*dataplanev1.Pipeline, string, error) {
	filtered := f.GetNameContains() != "" || len(f.GetTags()) > 0 || len(f.GetStates()) > 0
	pipelines := make([]*dataplanev1.Pipeline, 0)
	opts := metav1.ListOptions{Continue: token, Limit: pageSize}
	for {
		if filtered && pageSize > 0 {
			opts.Limit = pageSize - int64(len(pipelines))
		}
		list, err := ri.List(ctx, opts)
		if err != nil {
			return nil, "", s.listError(ctx, err)
		}
		for i := range list.Items {
			if p := s.decodeForList(ctx, &list.Items[i]); p != nil && matchesFilter(p, f) {
				pipelines = append(pipelines, p)
			}
		}
		opts.Continue = list.GetContinue()
		if !filtered || opts.Continue == "" || (pageSize > 0 && int64(len(pipelines)) >= pageSize) {
			return pipelines, opts.Continue, nil
		}
	}
}

func (s *Service) listError(ctx context.Context, err error) error {
	if k8serrors.IsNotFound(err) {
		return apierrors.NewConnectError(
			connect.CodeFailedPrecondition,
			fmt.Errorf("the Pipeline CRD (%s) is not installed or not served", pipelineGVR.GroupResource()),
			apierrors.NewErrorInfo(dataplanev1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
		)
	}
	return s.kubeError(ctx, err, "failed to list pipelines", "")
}

// decodeForList returns nil for a CR that can't be decoded, logging it once
// per resourceVersion.
func (s *Service) decodeForList(ctx context.Context, obj *unstructured.Unstructured) *dataplanev1.Pipeline {
	cr, err := fromUnstructured(obj)
	if err == nil {
		return pipelineToProto(cr)
	}
	if _, seen := s.undecodable.LoadOrStore(string(obj.GetUID())+"/"+obj.GetResourceVersion(), struct{}{}); !seen {
		s.logger.WarnContext(ctx, "skipping undecodable pipeline", slog.String("pipeline_id", obj.GetName()), slog.Any("error", err))
	}
	return nil
}

// GetPipeline returns one Pipeline CR.
func (s *Service) GetPipeline(ctx context.Context, req *connect.Request[v1alpha1.GetPipelineRequest]) (*connect.Response[v1alpha1.GetPipelineResponse], error) {
	ri, err := s.pipelines(ctx)
	if err != nil {
		return nil, err
	}
	_, cr, err := s.get(ctx, ri, req.Msg.GetRequest().GetId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&v1alpha1.GetPipelineResponse{Response: &dataplanev1.GetPipelineResponse{
		Pipeline: pipelineToProto(cr),
	}}), nil
}

// CreatePipeline creates a Console-managed Pipeline CR from the safe field subset.
func (s *Service) CreatePipeline(ctx context.Context, req *connect.Request[v1alpha1.CreatePipelineRequest]) (*connect.Response[v1alpha1.CreatePipelineResponse], error) {
	in := req.Msg.GetRequest().GetPipeline()
	if in == nil {
		return nil, newInvalidArgument("request.pipeline", "pipeline is required")
	}
	if in.GetDraft() {
		return nil, newInvalidArgument("request.pipeline.draft", "draft pipelines are not supported for Kubernetes-backed pipelines")
	}
	if err := s.checkConfig(in.GetConfigYaml()); err != nil {
		return nil, err
	}
	cpu, memory, err := normalizeResources(in.GetResources())
	if err != nil {
		return nil, err
	}

	ri, err := s.pipelines(ctx)
	if err != nil {
		return nil, err
	}

	createdBy, _ := kubernetesfactory.UserNameFromContext(ctx)
	desired := desiredPipeline{
		namespace:   s.cfg.Namespace,
		createdBy:   createdBy,
		displayName: in.GetDisplayName(),
		description: in.GetDescription(),
		configYAML:  in.GetConfigYaml(),
		tags:        in.GetTags(),
		cpu:         cpu,
		memory:      memory,
	}

	// Create (POST) fails atomically if the name is taken, so Console never
	// adopts an existing CR; retry with another suffix.
	for range maxCreateAttempts {
		desired.name = nameFromDisplayName(in.GetDisplayName(), s.newSuffix())
		out, err := s.create(ctx, ri, desired)
		if k8serrors.IsAlreadyExists(err) {
			continue
		}
		if err != nil {
			return nil, s.kubeError(ctx, err, "failed to create pipeline", desired.name)
		}
		s.audit(ctx, "create", out.GetId())
		return connect.NewResponse(&v1alpha1.CreatePipelineResponse{Response: &dataplanev1.CreatePipelineResponse{Pipeline: out}}), nil
	}
	return nil, apierrors.NewConnectError(
		connect.CodeAborted,
		fmt.Errorf("failed to find a free pipeline name after %d attempts", maxCreateAttempts),
		apierrors.NewErrorInfo(dataplanev1.Reason_REASON_CONSOLE_ERROR.String()),
	)
}

// UpdatePipeline updates the Console-owned fields of a Console-managed Pipeline CR.
func (s *Service) UpdatePipeline(ctx context.Context, req *connect.Request[v1alpha1.UpdatePipelineRequest]) (*connect.Response[v1alpha1.UpdatePipelineResponse], error) {
	r := req.Msg.GetRequest()
	in := r.GetPipeline()
	if in == nil {
		return nil, newInvalidArgument("request.pipeline", "pipeline is required")
	}
	if in.GetDraft() {
		return nil, newInvalidArgument("request.pipeline.draft", "draft pipelines are not supported for Kubernetes-backed pipelines")
	}

	ri, err := s.pipelines(ctx)
	if err != nil {
		return nil, err
	}
	stored, cr, err := s.getManaged(ctx, ri, r.GetId())
	if err != nil {
		return nil, err
	}

	desired := desiredFromCR(cr)
	if err := s.applyUpdate(&desired, in, r.GetUpdateMask().GetPaths()); err != nil {
		return nil, err
	}

	out, err := s.write(ctx, ri, stored, desired)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, "update", out.GetId())
	return connect.NewResponse(&v1alpha1.UpdatePipelineResponse{Response: &dataplanev1.UpdatePipelineResponse{Pipeline: out}}), nil
}

// applyUpdate overlays the request onto desired. Without a mask, every updatable
// field is replaced (PUT semantics), except resources, which are kept when omitted.
func (s *Service) applyUpdate(desired *desiredPipeline, in *dataplanev1.PipelineUpdate, paths []string) error {
	if err := validateUpdateMask(paths); err != nil {
		return err
	}
	all := len(paths) == 0
	set := func(field string) bool { return all || slices.Contains(paths, field) }

	if set("display_name") {
		desired.displayName = in.GetDisplayName()
	}
	if set("description") {
		desired.description = in.GetDescription()
	}
	if set("tags") {
		desired.tags = in.GetTags()
	}
	if set("config_yaml") {
		if err := s.checkConfig(in.GetConfigYaml()); err != nil {
			return err
		}
		desired.configYAML = in.GetConfigYaml()
	}
	if in.GetResources() == nil && all {
		return nil
	}
	cpu, memory, err := normalizeResources(in.GetResources())
	if err != nil {
		return err
	}
	if set("resources") || set("resources.cpu_shares") {
		desired.cpu = cpu
	}
	if set("resources") || set("resources.memory_shares") {
		desired.memory = memory
	}
	return nil
}

func validateUpdateMask(paths []string) error {
	for _, p := range paths {
		switch p {
		case "display_name", "description", "config_yaml", "tags", "resources", "resources.cpu_shares", "resources.memory_shares":
		case "service_account", "draft":
			// Not supported for Kubernetes-backed pipelines; never written.
		default:
			return newInvalidArgument("request.update_mask", fmt.Sprintf("unsupported update_mask path %q", p))
		}
	}
	return nil
}

// StopPipeline pauses a Console-managed pipeline (scales it to zero).
func (s *Service) StopPipeline(ctx context.Context, req *connect.Request[v1alpha1.StopPipelineRequest]) (*connect.Response[v1alpha1.StopPipelineResponse], error) {
	out, err := s.setPaused(ctx, req.Msg.GetRequest().GetId(), true)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, "stop", out.GetId())
	return connect.NewResponse(&v1alpha1.StopPipelineResponse{Response: &dataplanev1.StopPipelineResponse{Pipeline: out}}), nil
}

// StartPipeline resumes a paused Console-managed pipeline.
func (s *Service) StartPipeline(ctx context.Context, req *connect.Request[v1alpha1.StartPipelineRequest]) (*connect.Response[v1alpha1.StartPipelineResponse], error) {
	out, err := s.setPaused(ctx, req.Msg.GetRequest().GetId(), false)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, "start", out.GetId())
	return connect.NewResponse(&v1alpha1.StartPipelineResponse{Response: &dataplanev1.StartPipelineResponse{Pipeline: out}}), nil
}

func (s *Service) setPaused(ctx context.Context, id string, paused bool) (*dataplanev1.Pipeline, error) {
	ri, err := s.pipelines(ctx)
	if err != nil {
		return nil, err
	}
	stored, cr, err := s.getManaged(ctx, ri, id)
	if err != nil {
		return nil, err
	}
	desired := desiredFromCR(cr)
	desired.paused = paused
	return s.write(ctx, ri, stored, desired)
}

// DeletePipeline deletes a Console-managed Pipeline CR.
func (s *Service) DeletePipeline(ctx context.Context, req *connect.Request[v1alpha1.DeletePipelineRequest]) (*connect.Response[v1alpha1.DeletePipelineResponse], error) {
	ri, err := s.pipelines(ctx)
	if err != nil {
		return nil, err
	}
	_, cr, err := s.getManaged(ctx, ri, req.Msg.GetRequest().GetId())
	if err != nil {
		return nil, err
	}
	// Preconditions make sure we delete the exact object whose label we checked.
	err = ri.Delete(ctx, cr.Name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{
		UID:             &cr.UID,
		ResourceVersion: &cr.ResourceVersion,
	}})
	if err != nil {
		return nil, s.kubeError(ctx, err, "failed to delete pipeline", cr.Name)
	}
	s.audit(ctx, "delete", cr.Name)
	return connect.NewResponse(&v1alpha1.DeletePipelineResponse{Response: &dataplanev1.DeletePipelineResponse{}}), nil
}

// GetPipelineServiceConfigSchema returns the bundled Redpanda Connect config schema.
func (*Service) GetPipelineServiceConfigSchema(context.Context, *connect.Request[v1alpha1.GetPipelineServiceConfigSchemaRequest]) (*connect.Response[v1alpha1.GetPipelineServiceConfigSchemaResponse], error) {
	return connect.NewResponse(&v1alpha1.GetPipelineServiceConfigSchemaResponse{Response: &dataplanev1.GetPipelineServiceConfigSchemaResponse{
		ConfigSchema: string(rpconnect.GetConfigSchema()),
	}}), nil
}

// GetPipelinesForSecret returns no pipelines: secrets are out of scope for
// Kubernetes-backed pipelines.
func (*Service) GetPipelinesForSecret(_ context.Context, req *connect.Request[v1alpha1.GetPipelinesForSecretRequest]) (*connect.Response[v1alpha1.GetPipelinesForSecretResponse], error) {
	return connect.NewResponse(&v1alpha1.GetPipelinesForSecretResponse{Response: &dataplanev1.GetPipelinesForSecretResponse{
		PipelinesForSecret: &dataplanev1.PipelinesForSecret{SecretId: req.Msg.GetRequest().GetSecretId()},
	}}), nil
}

// GetPipelinesBySecrets returns no pipelines: secrets are out of scope for
// Kubernetes-backed pipelines.
func (*Service) GetPipelinesBySecrets(context.Context, *connect.Request[v1alpha1.GetPipelinesBySecretsRequest]) (*connect.Response[v1alpha1.GetPipelinesBySecretsResponse], error) {
	return connect.NewResponse(&v1alpha1.GetPipelinesBySecretsResponse{Response: &dataplanev1.GetPipelinesBySecretsResponse{}}), nil
}

func (s *Service) pipelines(ctx context.Context) (dynamic.ResourceInterface, error) {
	cl, err := s.clients.GetDynamicClient(ctx)
	if err != nil {
		return nil, s.kubeError(ctx, err, "failed to create kubernetes client", "")
	}
	return cl.Resource(pipelineGVR).Namespace(s.cfg.Namespace), nil
}

func (s *Service) get(ctx context.Context, ri dynamic.ResourceInterface, id string) (*unstructured.Unstructured, *pipelineCR, error) {
	// A "/" would address a subresource (e.g. "<name>/scale") instead of the CR.
	if errs := validation.IsDNS1123Subdomain(id); len(errs) > 0 {
		return nil, nil, newInvalidArgument("request.id", fmt.Sprintf("invalid pipeline id %q: %s", id, strings.Join(errs, "; ")))
	}
	obj, err := ri.Get(ctx, id, metav1.GetOptions{})
	if err != nil {
		return nil, nil, s.kubeError(ctx, err, "failed to get pipeline", id)
	}
	cr, err := fromUnstructuredOrInternal(obj)
	if err != nil {
		return nil, nil, err
	}
	return obj, cr, nil
}

// getManaged returns a CR that Console may write: labeled for Console, with
// no spec fields beyond the ones Console manages.
func (s *Service) getManaged(ctx context.Context, ri dynamic.ResourceInterface, id string) (*unstructured.Unstructured, *pipelineCR, error) {
	obj, cr, err := s.get(ctx, ri, id)
	if err != nil {
		return nil, nil, err
	}
	if !isManagedByConsole(cr) {
		return nil, nil, newNotManagedByConsoleError(cr.Name)
	}
	if fields := unmanageableSpecFields(obj); len(fields) > 0 {
		return nil, nil, newUnmanageableFieldsError(cr.Name, fields)
	}
	return obj, cr, nil
}

// render builds the object Console writes. The pipeline's identity (cluster
// and user) always comes from config, never from the request or the stored
// CR, and is sent on every write so server-side apply keeps it.
func (s *Service) render(desired desiredPipeline) (*unstructured.Unstructured, error) {
	desired.clusterRef = s.cfg.ClusterRef
	desired.userRef = s.cfg.UserRef
	obj := desired.toUnstructured()
	if err := checkSafeSubset(obj, s.cfg.ClusterRef, s.cfg.UserRef); err != nil {
		return nil, apierrors.NewConnectError(connect.CodeInternal, err, apierrors.NewErrorInfo(dataplanev1.Reason_REASON_CONSOLE_ERROR.String()))
	}
	return obj, nil
}

// create POSTs a new CR. It returns Kubernetes errors unconverted, so the
// caller can retry on AlreadyExists.
func (s *Service) create(ctx context.Context, ri dynamic.ResourceInterface, desired desiredPipeline) (*dataplanev1.Pipeline, error) {
	obj, err := s.render(desired)
	if err != nil {
		return nil, err
	}
	created, err := ri.Create(ctx, obj, metav1.CreateOptions{FieldManager: fieldManager})
	if err != nil {
		return nil, err
	}
	if upgraded, err := s.adoptUpdateFields(ctx, ri, created); err != nil {
		// The CR exists; the next write retries the upgrade.
		s.logger.WarnContext(ctx, "failed to move pipeline fields to server-side apply", slog.String("pipeline_id", created.GetName()), slog.Any("error", err))
	} else {
		created = upgraded
	}
	cr, err := fromUnstructuredOrInternal(created)
	if err != nil {
		return nil, err
	}
	return pipelineToProto(cr), nil
}

// adoptUpdateFields moves the fields a create (POST) recorded under Console's
// Update field manager to its Apply field manager. Server-side apply never
// removes fields another manager entry still owns, so otherwise a field Console
// later stops sending (a cleared description or tag) would stay forever.
func (*Service) adoptUpdateFields(ctx context.Context, ri dynamic.ResourceInterface, obj *unstructured.Unstructured) (*unstructured.Unstructured, error) {
	patch, err := csaupgrade.UpgradeManagedFieldsPatch(obj, sets.New(fieldManager), fieldManager)
	if err != nil || patch == nil {
		return obj, err
	}
	return ri.Patch(ctx, obj.GetName(), types.JSONPatchType, patch, metav1.PatchOptions{FieldManager: fieldManager})
}

// write server-side applies desired over stored, an existing Console-managed CR.
func (s *Service) write(ctx context.Context, ri dynamic.ResourceInterface, stored *unstructured.Unstructured, desired desiredPipeline) (*dataplanev1.Pipeline, error) {
	obj, err := s.render(desired)
	if err != nil {
		return nil, err
	}
	stored, err = s.adoptUpdateFields(ctx, ri, stored)
	if err != nil {
		return nil, s.kubeError(ctx, err, "failed to apply pipeline", desired.name)
	}
	obj.SetResourceVersion(stored.GetResourceVersion())

	out, err := s.apply(ctx, ri, obj)
	if err != nil {
		return nil, s.kubeError(ctx, err, "failed to apply pipeline", desired.name)
	}
	cr, err := fromUnstructuredOrInternal(out)
	if err != nil {
		return nil, err
	}
	return pipelineToProto(cr), nil
}

// audit logs every pipeline change Console makes. In ServiceAccount mode the
// Kubernetes audit log attributes all of them to Console's ServiceAccount.
func (s *Service) audit(ctx context.Context, action, pipelineID string) {
	logger := s.logger
	if user, ok := kubernetesfactory.UserNameFromContext(ctx); ok {
		logger = logger.With(slog.String("user", user))
	}
	logger.InfoContext(ctx, "pipeline changed", slog.String("action", action), slog.String("pipeline_id", pipelineID))
}

// fatalLintTypes don't depend on the bundled schema or the pod environment. The
// bundled schema lags the operator's Connect image (it doesn't know the redpanda
// input/output), and env vars like ${ORDERS_TOPIC} only exist in the pod, so
// other findings are left to the operator's lint init container (ConfigValid).
var fatalLintTypes = []service.LintType{service.LintFailedRead, service.LintBadLabel, service.LintDuplicateLabel}

// checkConfig runs before every write of a config: lint, then the component
// and function denylist.
func (s *Service) checkConfig(configYAML string) error {
	lints, err := s.linter.LintYAMLConfig([]byte(configYAML))
	if err != nil {
		return newInvalidArgument("config_yaml", fmt.Sprintf("failed to parse pipeline config: %v", err))
	}
	fatal := slices.DeleteFunc(lints, func(l service.Lint) bool { return !slices.Contains(fatalLintTypes, l.Type) })
	if len(fatal) > 0 {
		return newLintError(fatal)
	}
	return checkConfigPolicy(configYAML)
}

func fromUnstructuredOrInternal(obj *unstructured.Unstructured) (*pipelineCR, error) {
	cr, err := fromUnstructured(obj)
	if err != nil {
		return nil, apierrors.NewConnectError(connect.CodeInternal, err, apierrors.NewErrorInfo(dataplanev1.Reason_REASON_TYPE_MAPPING_ERROR.String()))
	}
	return cr, nil
}

func normalizeResources(r *dataplanev1.Pipeline_Resources) (cpu, memory string, err error) {
	if cpu, err = normalizeQuantity("resources.cpu_shares", r.GetCpuShares()); err != nil {
		return "", "", err
	}
	if memory, err = normalizeQuantity("resources.memory_shares", r.GetMemoryShares()); err != nil {
		return "", "", err
	}
	return cpu, memory, nil
}

func matchesFilter(p *dataplanev1.Pipeline, f *dataplanev1.ListPipelinesRequest_Filter) bool {
	if f == nil {
		return true
	}
	if f.GetSecretId() != "" {
		return false
	}
	if nc := strings.ToLower(f.GetNameContains()); nc != "" &&
		!strings.Contains(strings.ToLower(p.GetDisplayName()), nc) && !strings.Contains(p.GetId(), nc) {
		return false
	}
	for k, v := range f.GetTags() {
		if got, ok := p.GetTags()[k]; !ok || got != v {
			return false
		}
	}
	if len(f.GetStates()) > 0 && !slices.Contains(f.GetStates(), p.GetState()) {
		return false
	}
	return true
}
