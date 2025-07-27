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
	"log/slog"
	"slices"
	"strings"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"buf.build/go/protovalidate"
	"connectrpc.com/connect"
	"google.golang.org/genproto/googleapis/api/annotations"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
)

// ValidationInterceptor validates incoming requests against the provided validation.
type ValidationInterceptor struct {
	validator protovalidate.Validator
	logger    *slog.Logger
}

// NewRequestValidationInterceptor creates an interceptor to validate Connect requests.
func NewRequestValidationInterceptor(validator protovalidate.Validator, logger *slog.Logger) *ValidationInterceptor {
	return &ValidationInterceptor{
		validator: validator,
		logger:    logger,
	}
}

type fm interface {
	GetUpdateMask() *fieldmaskpb.FieldMask
}

// UpdateAffectsField checks if a path is covered by a fieldmask.
func UpdateAffectsField(updateMask *fieldmaskpb.FieldMask, fieldPath string) bool {
	return len(fieldmaskpb.Intersect(updateMask, &fieldmaskpb.FieldMask{Paths: []string{fieldPath}}).Paths) > 0
}

// findResourceName attempts to find the resource name in a grpc request.
func findResourceName(req fm) (string, bool) {
	var resourceName string
	if protoMessage, ok := req.(proto.Message); ok {
		protoMessage.ProtoReflect().Range(func(fd protoreflect.FieldDescriptor, _ protoreflect.Value) bool {
			if fd.Kind() == protoreflect.MessageKind && !fd.IsMap() && !fd.IsList() {
				if opts := fd.Message().Options(); opts != nil {
					if e := proto.GetExtension(opts, annotations.E_Resource); e != nil {
						if p, ok := e.(*annotations.ResourceDescriptor); ok && p != nil {
							resourceName = p.Singular
							return false
						}
					}
				}
			}
			return true
		})
	}
	return resourceName, resourceName != ""
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

		// Second chance: strip errors of fields not covered by fieldmask.
		// Since fieldmask does not update fields not covered, it doesn't matter if they fail to validate.
		if fmEr, ok := protoMessage.(fm); ok {
			// There is an update mask. Find the resource field, based on google.api.resource annotation.
			// This allows us to strip the prefix from the validator, eg. pipeline.display_name throws an error; strip `pipeline.`.
			// This is necessary, because update_mask does not contain this prefix, it is scoped to operate "within" the resource already, eg. update_mask may be `"tags"`.
			if resourceName, ok := findResourceName(fmEr); ok {
				if e := new(protovalidate.ValidationError); errors.As(err, &e) {
					e.Violations = slices.DeleteFunc(e.Violations, func(v *protovalidate.Violation) bool {
						return !UpdateAffectsField(fmEr.GetUpdateMask(), strings.TrimPrefix(v.Proto.GetField().String(), resourceName+"."))
					})
					// If no violations anymore after stripping the obsolete ones - proceed with the call.
					if len(e.Violations) == 0 {
						return next(ctx, req)
					}
				}
			}
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
					Field:       protovalidate.FieldPathString(violation.Proto.GetField()),
					Description: violation.Proto.GetMessage(),
				}
				fieldViolations = append(fieldViolations, fieldViolationErr)
			}
			badRequest = apierrors.NewBadRequest(fieldViolations...)
		case errors.As(err, &runtimeErr):
			in.logger.ErrorContext(ctx, "validation runtime error", slog.Any("error", runtimeErr))
		case errors.As(err, &compilationErr):
			in.logger.ErrorContext(ctx, "validation compilation error", slog.Any("error", compilationErr))
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
	return next
}

// WrapStreamingHandler is the middleware handler for bidirectional requests from
// the server handling perspective.
func (*ValidationInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}
