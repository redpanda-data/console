// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package transform

import (
	"errors"
	"fmt"
	"io"
	"net/http"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/bufbuild/protovalidate-go"
	"go.uber.org/zap"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
)

const (
	// Define how many bytes are in a kilobyte (KiB) and a megabyte (MiB)
	kib int64 = 1024
	mib int64 = 1024 * kib
)

// HandleDeployTransform is the HTTP handler for deploying WASM transforms in Redpanda.
// Because we use multipart/form-data for uploading the binary file (up to 50mb), we did
// not use gRPC/protobuf for this.
func (s *Service) HandleDeployTransform() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.cfg.Redpanda.AdminAPI.Enabled {
			s.writeError(w, r, apierrors.NewRedpandaAdminAPINotConfiguredError())
			return
		}

		// 1. Parse input data that is sent using Multipart form encoding.
		if r.ContentLength == 0 {
			s.writeError(w, r, apierrors.NewConnectError(
				connect.CodeInvalidArgument,
				fmt.Errorf("request body must be a valid multipart/form-data payload, but sent body is empty"),
				apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			))
			return
		}

		// The max default binary upload size is 10MiB. Because this does not include
		// the metadata we added 5KiB as a limit.
		if err := r.ParseMultipartForm(10*mib + 5*kib); err != nil {
			s.writeError(w, r, apierrors.NewConnectError(
				connect.CodeInvalidArgument,
				fmt.Errorf("could not parse multipart form: %w", err),
				apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			))
			return
		}

		metadataJSON := r.FormValue("metadata")
		if metadataJSON == "" {
			s.writeError(w, r, apierrors.NewConnectError(
				connect.CodeInvalidArgument,
				fmt.Errorf("could not find or parse form field metadata"),
				apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			))
			return
		}

		wasmForm, _, err := r.FormFile("wasm_binary")
		if err != nil {
			s.writeError(w, r, apierrors.NewConnectError(
				connect.CodeInvalidArgument,
				fmt.Errorf("could not find or parse form field wasm_binary: %w", err),
				apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			))
			return
		}
		defer wasmForm.Close()

		wasmBinary, err := io.ReadAll(wasmForm)
		if err != nil {
			s.writeError(w, r, apierrors.NewConnectError(
				connect.CodeInvalidArgument,
				fmt.Errorf("could not read wasm binary: %w", err),
				apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			))
			return
		}

		// 2. Parse and validate request parameters
		var deployTransformReq v1alpha2.DeployTransformRequest
		err = protojson.UnmarshalOptions{}.Unmarshal([]byte(metadataJSON), &deployTransformReq)
		if err != nil {
			s.writeError(w, r, apierrors.NewConnectError(
				connect.CodeInvalidArgument,
				fmt.Errorf("unable to parse form field metadata: %w", err),
				apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			))
			return
		}
		if err := s.validateProtoMessage(&deployTransformReq); err != nil {
			s.writeError(w, r, err)
			return
		}

		// 3. Deploy WASM transform by calling the Redpanda Admin API
		if err := s.redpandaSvc.DeployWasmTransform(r.Context(), s.mapper.deployTransformReqToAdminAPI(&deployTransformReq), wasmBinary); err != nil {
			connectErr := apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "could not deploy wasm transform: ")
			s.writeError(w, r, connectErr)
			return
		}

		// 4. List transforms and find the just deployed transform from the response
		transforms, err := s.redpandaSvc.ListWasmTransforms(r.Context())
		if err != nil {
			connectErr := apierrors.NewConnectErrorFromRedpandaAdminAPIError(
				err,
				"deployed wasm transform, but could not list wasm transforms from Redpanda cluster: ",
			)
			s.writeError(w, r, connectErr)
			return
		}

		transformsProto, err := s.mapper.transformMetadataToProto(transforms)
		if err != nil {
			s.writeError(w, r, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("deployed wasm transform, but failed to map list response to proto: %w", err),
				apierrors.NewErrorInfo(v1alpha2.Reason_REASON_TYPE_MAPPING_ERROR.String()),
			))
			return
		}

		transformProto, err := findExactTransformByName(transformsProto, deployTransformReq.Name)
		if err != nil {
			s.writeError(w, r, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("deployed wasm transform, but failed to list it afterwards"),
				apierrors.NewErrorInfo(v1alpha2.Reason_REASON_TYPE_MAPPING_ERROR.String()),
			))
			return
		}

		// 5. Write found transform proto as JSON
		jsonBytes, err := protojson.MarshalOptions{UseProtoNames: true}.Marshal(transformProto)
		if err != nil {
			s.writeError(w, r, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("deployed wasm transform, but failed to serialize response into JSON: %w", err),
				apierrors.NewErrorInfo(v1alpha2.Reason_REASON_TYPE_MAPPING_ERROR.String()),
			))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		if _, err := w.Write(jsonBytes); err != nil {
			s.logger.Error("failed to write response to deploy wasm transform request", zap.Error(err))
		}
	}
}

// validateProtoMessage validates a given proto message using its
// validate rules which are defined as part of the proto message.
// This is usually done inside an interceptor, however HandleDeployTransform
// is special as it's not using the connect gateway.
func (s *Service) validateProtoMessage(msg proto.Message) error {
	err := s.validator.Validate(msg)
	if err == nil {
		return nil
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
		s.logger.Error("validation runtime error", zap.Error(runtimeErr))
	case errors.As(err, &compilationErr):
		s.logger.Error("validation compilation error", zap.Error(compilationErr))
	}

	return apierrors.NewConnectError(
		connect.CodeInvalidArgument,
		errors.New("provided parameters are invalid"),
		apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		badRequest, // This may be nil, but that's okay.
	)
}
