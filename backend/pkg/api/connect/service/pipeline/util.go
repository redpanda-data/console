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
	"log/slog"
	"strconv"
	"strings"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/redpanda-data/benthos/v4/public/service"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

// maxNameLen keeps generated names usable as label values (app.kubernetes.io/instance).
const (
	maxNameLen   = 63
	suffixLen    = 5
	maxSlugLen   = maxNameLen - suffixLen - 1
	fallbackSlug = "pipeline"
)

// nameFromDisplayName returns a DNS-1035 label: a slug of the display name plus a
// random suffix. DNS-1035 (letter first) is stricter than CRs need, but the
// operator reuses the name for child objects and label values.
func nameFromDisplayName(displayName, suffix string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(displayName) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		case !dash && b.Len() > 0:
			b.WriteByte('-')
			dash = true
		}
	}
	slug := b.String()
	if len(slug) > maxSlugLen {
		slug = slug[:maxSlugLen]
	}
	slug = strings.Trim(slug, "-")
	if slug == "" || slug[0] < 'a' || slug[0] > 'z' {
		slug = strings.Trim(fallbackSlug+"-"+slug, "-")
		if len(slug) > maxSlugLen {
			slug = strings.TrimRight(slug[:maxSlugLen], "-")
		}
	}
	return slug + "-" + suffix
}

func normalizeQuantity(field, value string) (string, error) {
	if value == "" {
		return "", nil
	}
	q, err := resource.ParseQuantity(value)
	if err != nil {
		return "", newInvalidArgument(field, fmt.Sprintf("invalid quantity %q: %v", value, err))
	}
	if q.Sign() < 0 {
		return "", newInvalidArgument(field, fmt.Sprintf("invalid quantity %q: must not be negative", value))
	}
	// The UI sends "0" to mean unset.
	if q.IsZero() {
		return "", nil
	}
	return q.String(), nil
}

func newInvalidArgument(field, description string) *connect.Error {
	return apierrors.NewConnectError(
		connect.CodeInvalidArgument,
		errors.New(description),
		apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		apierrors.NewBadRequest(&errdetails.BadRequest_FieldViolation{Field: field, Description: description}),
	)
}

func newLintError(lints []service.Lint) *connect.Error {
	violations := make([]*errdetails.BadRequest_FieldViolation, 0, len(lints))
	msgs := make([]string, 0, len(lints))
	for _, l := range lints {
		violations = append(violations, &errdetails.BadRequest_FieldViolation{Field: "config_yaml", Description: l.Error()})
		msgs = append(msgs, l.Error())
	}
	return apierrors.NewConnectError(
		connect.CodeInvalidArgument,
		errors.New("pipeline config is invalid: "+strings.Join(msgs, "; ")),
		apierrors.NewErrorInfo(dataplanev1.Reason_REASON_CONNECT_INVALID_PIPELINE_CONFIGURATION.String()),
		apierrors.NewBadRequest(violations...),
	)
}

func newNotManagedByConsoleError(name string) *connect.Error {
	return apierrors.NewConnectError(
		connect.CodeFailedPrecondition,
		fmt.Errorf("pipeline %q is managed outside Console (for example with kubectl or GitOps) and is read-only here", name),
		apierrors.NewErrorInfo(dataplanev1.Reason_REASON_CONSOLE_ERROR.String()),
	)
}

func newUnmanageableFieldsError(name string, fields []string) *connect.Error {
	return apierrors.NewConnectError(
		connect.CodeFailedPrecondition,
		fmt.Errorf("pipeline %s uses fields Console can't manage: %s; manage it with kubectl", name, strings.Join(fields, ", ")),
		apierrors.NewErrorInfo(dataplanev1.Reason_REASON_CONSOLE_ERROR.String()),
	)
}

// kubeError maps a Kubernetes API error to a Connect error. API server text
// can name ServiceAccounts, admission policies, and internal URLs, so it's only
// returned for errors about the request itself (invalid, conflict, not found,
// already exists). Other errors are logged with their full text and returned
// with a generic message plus the Kubernetes reason.
func (s *Service) kubeError(ctx context.Context, err error, msg, pipelineID string) error {
	var connectErr *connect.Error
	if errors.As(err, &connectErr) {
		return connectErr
	}
	if errors.Is(err, context.Canceled) {
		return apierrors.NewConnectError(connect.CodeCanceled, errors.New(msg+": request canceled"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_TIMEOUT.String()))
	}

	var status k8serrors.APIStatus
	if !errors.As(err, &status) {
		// Transport errors (DNS, TLS, timeouts) carry the API server's URL.
		s.logKubeError(ctx, err, msg, pipelineID)
		code, reason := connect.CodeInternal, commonv1alpha1.Reason_REASON_SERVER_ERROR
		if errors.Is(err, context.DeadlineExceeded) {
			code, reason = connect.CodeDeadlineExceeded, commonv1alpha1.Reason_REASON_TIMEOUT
		}
		return apierrors.NewConnectError(code, errors.New(msg+": the Kubernetes API request failed; see the Console logs for details"),
			apierrors.NewErrorInfo(reason.String()))
	}

	code, reason := codeFromKubernetesError(err)
	st := status.Status()
	info := apierrors.NewErrorInfo(reason.String(),
		apierrors.KeyVal{Key: "kubernetes_status_code", Value: strconv.Itoa(int(st.Code))},
		apierrors.KeyVal{Key: "kubernetes_reason", Value: string(st.Reason)},
	)
	switch {
	case k8serrors.IsResourceExpired(err), k8serrors.IsGone(err):
		return apierrors.NewConnectError(code, errors.New(msg+": listing expired, restart from the first page"), info)
	case k8serrors.IsInvalid(err), k8serrors.IsBadRequest(err), k8serrors.IsConflict(err),
		k8serrors.IsNotFound(err), k8serrors.IsAlreadyExists(err):
		// Field-level messages (CRD and admission policy validation) help the user fix the request.
		return apierrors.NewConnectError(code, fmt.Errorf("%s: %s", msg, st.Message), info)
	}
	s.logKubeError(ctx, err, msg, pipelineID)
	kubeReason := string(st.Reason)
	if kubeReason == "" {
		kubeReason = strconv.Itoa(int(st.Code))
	}
	return apierrors.NewConnectError(code,
		fmt.Errorf("%s: the Kubernetes API returned %s; see the Console logs for details", msg, kubeReason), info)
}

func (s *Service) logKubeError(ctx context.Context, err error, msg, pipelineID string) {
	if pipelineID == "" {
		s.logger.ErrorContext(ctx, msg, slog.Any("error", err))
		return
	}
	s.logger.ErrorContext(ctx, msg, slog.String("pipeline_id", pipelineID), slog.Any("error", err))
}

func codeFromKubernetesError(err error) (connect.Code, commonv1alpha1.Reason) {
	switch {
	case k8serrors.IsUnauthorized(err):
		return connect.CodeUnauthenticated, commonv1alpha1.Reason_REASON_AUTHENTICATION_TOKEN_INVALID
	case k8serrors.IsForbidden(err):
		return connect.CodePermissionDenied, commonv1alpha1.Reason_REASON_PERMISSION_DENIED
	case k8serrors.IsNotFound(err):
		return connect.CodeNotFound, commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND
	case k8serrors.IsAlreadyExists(err):
		return connect.CodeAlreadyExists, commonv1alpha1.Reason_REASON_INVALID_INPUT
	case k8serrors.IsConflict(err):
		// resourceVersion precondition or field-manager conflict: someone else
		// changed the pipeline concurrently, so the caller should re-read and retry.
		return connect.CodeAborted, commonv1alpha1.Reason_REASON_INVALID_INPUT
	case k8serrors.IsResourceExpired(err), k8serrors.IsGone(err):
		// The page token's snapshot was compacted away.
		return connect.CodeAborted, commonv1alpha1.Reason_REASON_INVALID_INPUT
	case k8serrors.IsInvalid(err), k8serrors.IsBadRequest(err):
		return connect.CodeInvalidArgument, commonv1alpha1.Reason_REASON_INVALID_INPUT
	case k8serrors.IsTooManyRequests(err):
		return connect.CodeResourceExhausted, commonv1alpha1.Reason_REASON_TOO_MANY_REQUESTS
	case k8serrors.IsTimeout(err), k8serrors.IsServerTimeout(err):
		return connect.CodeDeadlineExceeded, commonv1alpha1.Reason_REASON_TIMEOUT
	case k8serrors.IsServiceUnavailable(err):
		return connect.CodeUnavailable, commonv1alpha1.Reason_REASON_SERVER_ERROR
	default:
		return connect.CodeInternal, commonv1alpha1.Reason_REASON_SERVER_ERROR
	}
}
