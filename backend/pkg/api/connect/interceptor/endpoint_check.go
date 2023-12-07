// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package interceptor

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

// EndpointCheckInterceptor checks whether incoming requests on the given endpoint
// should pass or not. An endpoint can be enabled or disabled via the Console config.
type EndpointCheckInterceptor struct {
	cfg    *config.ConsoleAPI
	logger *zap.Logger
}

// NewEndpointCheckInterceptor creates a new EndpointCheckInterceptor.
func NewEndpointCheckInterceptor(cfg *config.ConsoleAPI, logger *zap.Logger) *EndpointCheckInterceptor {
	return &EndpointCheckInterceptor{
		cfg:    cfg,
		logger: logger,
	}
}

// WrapUnary creates an interceptor to validate Connect requests.
func (in *EndpointCheckInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		procedure := req.Spec().Procedure

		// For HTTP paths invoked via gRPC gateway this is expected not to be set.
		// Let's try to retrieve it with gRPC gateway's runtime pkg.
		if procedure == "" {
			path, ok := runtime.RPCMethod(ctx)
			if !ok {
				return nil, apierrors.NewConnectError(
					connect.CodeInternal,
					errors.New("failed to extract procedure name"),
					apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()))
			}
			procedure = path
		}

		if procedure == "" {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				errors.New("failed to retrieve procedure name"),
				apierrors.NewErrorInfo(v1alpha1.Reason_REASON_CONSOLE_ERROR.String()))
		}

		notEnabledError := apierrors.NewConnectError(
			connect.CodeUnimplemented,
			errors.New("this endpoint has not been enabled"),
			apierrors.NewErrorInfo(
				v1alpha1.Reason_REASON_FEATURE_NOT_CONFIGURED.String(),
				apierrors.KeyVal{
					Key:   "requested_procedure",
					Value: procedure,
				},
			))

		if !in.cfg.Enabled {
			return nil, notEnabledError
		}

		// Check wildcard that allows all procedures first
		if in.cfg.AllowsAllProcedures {
			return next(ctx, req)
		}

		_, isAllowed := in.cfg.EnabledProceduresMap[procedure]
		if !isAllowed {
			return nil, notEnabledError
		}

		return next(ctx, req)
	}
}

// WrapStreamingClient is the middleware handler for bidirectional requests from
// the client perspective.
func (*EndpointCheckInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

// WrapStreamingHandler is the middleware handler for bidirectional requests from
// the server handling perspective.
func (*EndpointCheckInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}
