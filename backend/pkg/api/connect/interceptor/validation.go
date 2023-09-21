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
	"github.com/bufbuild/protovalidate-go"
	"go.uber.org/zap"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/protobuf/proto"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
)

// NewRequestValidationInterceptor creates an interceptor to validate Connect requests.
func NewRequestValidationInterceptor(validator *protovalidate.Validator, logger *zap.Logger) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			protoMessage, ok := req.Any().(proto.Message)
			if !ok {
				return nil, apierrors.NewConnectError(
					connect.CodeInvalidArgument,
					errors.New("request is not a protocol buffer message"),
					apierrors.NewErrorInfo(apierrors.ReasonInvalidInput),
				)
			}

			// Check error, if no error, we can proceed otherwise we'll convert
			// the error to something more descriptive.
			err := validator.Validate(protoMessage)
			if err == nil {
				return next(ctx, req)
			}

			var badRequest *errdetails.BadRequest
			switch v := err.(type) {
			case *protovalidate.ValidationError:
				var validationErrs []*errdetails.BadRequest_FieldViolation
				for _, violation := range v.Violations {
					fieldViolationErr := &errdetails.BadRequest_FieldViolation{
						Field:       violation.FieldPath,
						Description: violation.Message,
					}
					validationErrs = append(validationErrs, fieldViolationErr)
				}
				badRequest = apierrors.NewBadRequest(validationErrs...)
			case *protovalidate.RuntimeError:
				logger.Error("validation runtime error", zap.Error(v))
			case *protovalidate.CompilationError:
				logger.Error("validation compilation error", zap.Error(v))
			}

			return nil, apierrors.NewConnectError(
				connect.CodeInvalidArgument,
				errors.New("provided parameters are invalid"),
				apierrors.NewErrorInfo(apierrors.ReasonInvalidInput),
				badRequest, // This may be nil, but that's okay.
			)
		}
	}
}
