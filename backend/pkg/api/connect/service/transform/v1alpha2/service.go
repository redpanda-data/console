// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package transform contains the implementation of all Transform endpoints.
package transform

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/bufbuild/protovalidate-go"
	"github.com/redpanda-data/common-go/api/pagination"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

var _ dataplanev1alpha2connect.TransformServiceHandler = (*Service)(nil)

// Service is the implementation of the transform service.
type Service struct {
	cfg         *config.Config
	logger      *zap.Logger
	redpandaSvc *redpanda.Service
	validator   *protovalidate.Validator
	mapper      mapper
	errorWriter *connect.ErrorWriter
	defaulter   defaulter
}

// NewService creates a new transform service handler.
func NewService(cfg *config.Config,
	logger *zap.Logger,
	redpandaSvc *redpanda.Service,
	protoValidator *protovalidate.Validator,
) *Service {
	return &Service{
		cfg:         cfg,
		logger:      logger,
		redpandaSvc: redpandaSvc,
		validator:   protoValidator,
		mapper:      mapper{},
		errorWriter: connect.NewErrorWriter(),
		defaulter:   defaulter{},
	}
}

// writeError writes an error using connect.ErrorWriter and also logs this event.
func (s *Service) writeError(w http.ResponseWriter, r *http.Request, err error) {
	childLogger := s.logger.With(
		zap.String("request_method", r.Method),
		zap.String("request_path", r.URL.Path),
	)

	apierrors.HandleHTTPError(r.Context(), w, r, err)
	childLogger.Warn("", zap.Error(err))
}

// ListTransforms lists all the transforms matching the filter deployed to Redpanda
func (s *Service) ListTransforms(ctx context.Context, c *connect.Request[v1alpha2.ListTransformsRequest]) (*connect.Response[v1alpha2.ListTransformsResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	s.defaulter.applyListTransformsRequest(c.Msg)

	transforms, err := s.redpandaSvc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
	}

	transformsProto, err := s.mapper.transformMetadataToProto(transforms)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha2.Reason_REASON_TYPE_MAPPING_ERROR.String()),
		)
	}

	hasFilter := c.Msg.GetFilter() != nil && c.Msg.GetFilter().GetNameContains() != ""
	if hasFilter {
		transformsProto = findTransformsByNameContains(transformsProto, c.Msg.GetFilter().GetNameContains())
	}

	// Add pagination
	var nextPageToken string
	if c.Msg.GetPageSize() > 0 {
		sort.SliceStable(transformsProto, func(i, j int) bool {
			return transformsProto[i].Name < transformsProto[j].Name
		})
		page, token, err := pagination.SliceToPaginatedWithToken(transformsProto, int(c.Msg.PageSize), c.Msg.GetPageToken(), "name", func(x *v1alpha2.TransformMetadata) string {
			return x.GetName()
		})
		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("failed to apply pagination: %w", err),
				apierrors.NewErrorInfo(v1alpha2.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
		nextPageToken = token
		transformsProto = page
	}

	return &connect.Response[v1alpha2.ListTransformsResponse]{
		Msg: &v1alpha2.ListTransformsResponse{
			Transforms:    transformsProto,
			NextPageToken: nextPageToken,
		},
	}, nil
}

// GetTransform gets a transform by name
func (s *Service) GetTransform(ctx context.Context, c *connect.Request[v1alpha2.GetTransformRequest]) (*connect.Response[v1alpha2.GetTransformResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	transforms, err := s.redpandaSvc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
	}

	tfs, err := s.mapper.transformMetadataToProto(transforms)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(v1alpha2.Reason_REASON_TYPE_MAPPING_ERROR.String()),
		)
	}

	transform, err := findExactTransformByName(tfs, c.Msg.Name)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String()),
		)
	}
	return &connect.Response[v1alpha2.GetTransformResponse]{
		Msg: &v1alpha2.GetTransformResponse{
			Transform: transform,
		},
	}, nil
}

// DeleteTransform deletes a transform by name
func (s *Service) DeleteTransform(ctx context.Context, c *connect.Request[v1alpha2.DeleteTransformRequest]) (*connect.Response[v1alpha2.DeleteTransformResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	transforms, err := s.redpandaSvc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
	}

	tfs, err := s.mapper.transformMetadataToProto(transforms)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(v1alpha2.Reason_REASON_TYPE_MAPPING_ERROR.String()),
		)
	}

	transform, err := findExactTransformByName(tfs, c.Msg.Name)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String()),
		)
	}

	if err := s.redpandaSvc.DeleteWasmTransform(ctx, transform.Name); err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha2.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	connectResponse := connect.NewResponse(&v1alpha2.DeleteTransformResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}
