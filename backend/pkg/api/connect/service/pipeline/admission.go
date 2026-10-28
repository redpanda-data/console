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
	"fmt"
	"strings"

	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

const admissionProbeConfig = `input:
  generate:
    mapping: root = {}
output:
  drop: {}
`

// VerifyAdmissionPolicy checks, in ServiceAccount mode, that the API server
// rejects a Pipeline write Console must never make. Console's own guards (the
// managed-by label, the safe field subset, the clusterRef and userRef pins)
// run in Console; if Console's ServiceAccount token leaks, only the Redpanda
// Operator's ValidatingAdmissionPolicy for Console stops it from writing
// image, serviceAccountName, or valueSources. The check is a dry-run create
// that sets spec.image, so nothing is persisted.
//
// It does nothing with impersonateUser (the policy only matches Console's
// ServiceAccount) or skipAdmissionCheck.
func (s *Service) VerifyAdmissionPolicy(ctx context.Context) error {
	if s.cfg.ImpersonateUser || s.cfg.SkipAdmissionCheck {
		return nil
	}
	cl, err := s.clients.GetDynamicClient(ctx)
	if err != nil {
		return fmt.Errorf("failed to create kubernetes client: %w", err)
	}
	probe := desiredPipeline{
		name:       "console-admission-probe-" + s.newSuffix(),
		namespace:  s.cfg.Namespace,
		configYAML: admissionProbeConfig,
	}.toUnstructured()
	if err := unstructured.SetNestedField(probe.Object, "probe", "spec", "image"); err != nil {
		return fmt.Errorf("failed to build admission probe: %w", err)
	}

	_, err = cl.Resource(pipelineGVR).Namespace(s.cfg.Namespace).Create(ctx, probe, metav1.CreateOptions{
		DryRun:       []string{metav1.DryRunAll},
		FieldManager: fieldManager,
	})
	switch {
	case err == nil:
		return errors.New("the Kubernetes API server accepted a Pipeline with spec.image from Console's ServiceAccount " +
			"(dry run), so the Redpanda Operator's ValidatingAdmissionPolicy for Console isn't installed: " +
			"install Console with the operator's console chart and pipelines.enabled: true (Kubernetes 1.30+), " +
			"or set pipelines.kubernetes.skipAdmissionCheck: true to run without it")
	case isRBACDenied(err):
		return fmt.Errorf("failed to check the Pipeline admission policy: Console's ServiceAccount can't create Pipelines in namespace %q: %w",
			s.cfg.Namespace, err)
	case k8serrors.IsForbidden(err), k8serrors.IsInvalid(err):
		// Denied by admission. The operator's policy reports Invalid; webhooks may report Forbidden.
		return nil
	default:
		return fmt.Errorf("failed to check the Pipeline admission policy: %w", err)
	}
}

// isRBACDenied tells an authorization failure apart from an admission denial;
// both are 403 Forbidden, but only the authorizer's message says "cannot".
func isRBACDenied(err error) bool {
	return k8serrors.IsForbidden(err) && strings.Contains(err.Error(), "cannot create resource")
}
