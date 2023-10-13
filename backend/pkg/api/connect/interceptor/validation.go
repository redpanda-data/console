// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package interceptor defines all connect interceptors that can be used for
// the connect api.
package interceptor

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"github.com/bufbuild/protovalidate-go"
	"go.uber.org/zap"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/protobuf/proto"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	commonv1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/common/v1alpha1"
)

// ValidationInterceptor validates incoming requests against the provided validation.
type ValidationInterceptor struct {
	validator *protovalidate.Validator
	logger    *zap.Logger
}

// NewRequestValidationInterceptor creates an interceptor to validate Connect requests.
func NewRequestValidationInterceptor(validator *protovalidate.Validator, logger *zap.Logger) *ValidationInterceptor {
	return &ValidationInterceptor{
		validator: validator,
		logger:    logger,
	}
}

// WrapUnary creates an interceptor to validate Connect requests.
func (in *ValidationInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		protoMessage, ok := req.Any().(proto.Message)
		if !ok {
			return nil, apierrors.NewConnectError(
				connect.CodeInvalidArgument,
				errors.New("request is not a protocol buffer message"),
				apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			)
		}

		// Check error, if no error, we can proceed otherwise we'll convert
		// the error to something more descriptive.
		err := in.validator.Validate(protoMessage)
		if err == nil {
			return next(ctx, req)
		}

		var badRequest *errdetails.BadRequest
		var validationErr *protovalidate.ValidationError
		var runtimeErr *protovalidate.RuntimeError
		var compilationErr *protovalidate.CompilationError

		switch {
		case errors.As(err, &validationErr):
			var fieldViolations []*errdetails.BadRequest_FieldViolation
			for _, violation := range validationErr.Violations {
				fieldViolationErr := &errdetails.BadRequest_FieldViolation{
					Field:       violation.FieldPath,
					Description: violation.Message,
				}
				fieldViolations = append(fieldViolations, fieldViolationErr)
			}
			badRequest = apierrors.NewBadRequest(fieldViolations...)
		case errors.As(err, &runtimeErr):
			in.logger.Error("validation runtime error", zap.Error(runtimeErr))
		case errors.As(err, &compilationErr):
			in.logger.Error("validation compilation error", zap.Error(compilationErr))
		}

		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			errors.New("provided parameters are invalid"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			badRequest, // This may be nil, but that's okay.
		)
	}
}

// WrapStreamingClient is the middleware handler for bidirectional requests from
// the client perspective.
func (*ValidationInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return connect.StreamingClientFunc(func(
		ctx context.Context,
		spec connect.Spec,
	) connect.StreamingClientConn {
		// To be implemented
		return next(ctx, spec)
	})
}

// WrapStreamingHandler is the middleware handler for bidirectional requests from
// the server handling perspective.
func (in *ValidationInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return connect.StreamingHandlerFunc(func(
		ctx context.Context,
		conn connect.StreamingHandlerConn,
	) error {
		// To be implemented
		return next(ctx, conn)
	})
}
