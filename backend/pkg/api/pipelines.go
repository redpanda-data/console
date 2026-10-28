// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"

	pipelinesvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/pipeline"
	kubernetesfactory "github.com/redpanda-data/console/backend/pkg/factory/kubernetes"
	loggerpkg "github.com/redpanda-data/console/backend/pkg/logger"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

// admissionCheckTimeout bounds the startup check for the operator's
// ValidatingAdmissionPolicy.
const admissionCheckTimeout = 15 * time.Second

// newKubernetesPipelineService builds the PipelineService backed by Redpanda
// Operator Pipeline CRs (pipelines.kubernetes.enabled).
func (api *API) newKubernetesPipelineService() (*pipelinesvc.Service, error) {
	cfg := api.Cfg.Pipelines.Kubernetes
	clients, err := kubernetesfactory.NewClientProvider(cfg.ImpersonateUser)
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes client provider: %w", err)
	}
	svc, err := pipelinesvc.NewService(cfg, loggerpkg.Named(api.Logger, "pipeline_service"), clients)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), admissionCheckTimeout)
	defer cancel()
	if err := svc.VerifyAdmissionPolicy(ctx); err != nil {
		return nil, err
	}
	return svc, nil
}

// pipelineConnectServices returns the pipeline services to mount from the
// (possibly hook-mutated) services map. A service is skipped when the hook
// mounts its own, because chi panics on duplicate mounts.
func pipelineConnectServices(hookOutput ConfigConnectRPCResponse, opts ...connect.HandlerOption) []ConnectService {
	hooked := make(map[string]bool, len(hookOutput.AdditionalServices))
	for _, additional := range hookOutput.AdditionalServices {
		hooked[additional.ServiceName] = true
	}

	var out []ConnectService
	if svc, ok := hookOutput.Services[consolev1alpha1connect.PipelineServiceName].(consolev1alpha1connect.PipelineServiceHandler); ok && !hooked[consolev1alpha1connect.PipelineServiceName] {
		path, handler := consolev1alpha1connect.NewPipelineServiceHandler(svc, opts...)
		out = append(out, ConnectService{ServiceName: consolev1alpha1connect.PipelineServiceName, MountPath: path, Handler: handler})
	}
	return out
}
