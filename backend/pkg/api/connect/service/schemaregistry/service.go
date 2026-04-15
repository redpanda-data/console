// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package schemaregistry implements the SchemaRegistryService RPCs for managing
// schema registry mode and compatibility configuration.
package schemaregistry

import (
	"context"
	"fmt"
	"log/slog"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/sr"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

// Ensure that Service implements the SchemaRegistryServiceHandler interface.
var _ consolev1alpha1connect.SchemaRegistryServiceHandler = (*Service)(nil)

// Service implements the SchemaRegistryServiceHandler interface for managing
// schema registry mode and compatibility configuration.
type Service struct {
	cfg        *config.Config
	logger     *slog.Logger
	consoleSvc console.Servicer
}

// NewService creates a new SchemaRegistryService handler.
func NewService(
	cfg *config.Config,
	logger *slog.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		cfg:        cfg,
		logger:     logger,
		consoleSvc: consoleSvc,
	}
}

// GetSchemaRegistryMode returns the global schema registry mode.
func (s *Service) GetSchemaRegistryMode(ctx context.Context, _ *connect.Request[v1alpha1.GetSchemaRegistryModeRequest]) (*connect.Response[v1alpha1.GetSchemaRegistryModeResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	res, err := s.consoleSvc.GetSchemaRegistryMode(ctx, "")
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "failed to get schema registry mode: ")
	}

	return connect.NewResponse(&v1alpha1.GetSchemaRegistryModeResponse{
		Mode: res.Mode,
	}), nil
}

// SetSchemaRegistryMode sets the global schema registry mode.
func (s *Service) SetSchemaRegistryMode(ctx context.Context, req *connect.Request[v1alpha1.SetSchemaRegistryModeRequest]) (*connect.Response[v1alpha1.SetSchemaRegistryModeResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	mode, err := parseMode(req.Msg.GetMode())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	res, err := s.consoleSvc.PutSchemaRegistryMode(ctx, mode, "")
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "failed to set schema registry mode: ")
	}

	return connect.NewResponse(&v1alpha1.SetSchemaRegistryModeResponse{
		Mode: res.Mode,
	}), nil
}

// GetSchemaRegistrySubjectMode returns the mode for a specific subject.
func (s *Service) GetSchemaRegistrySubjectMode(ctx context.Context, req *connect.Request[v1alpha1.GetSchemaRegistrySubjectModeRequest]) (*connect.Response[v1alpha1.GetSchemaRegistrySubjectModeResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	res, err := s.consoleSvc.GetSchemaRegistryMode(ctx, req.Msg.GetSubject())
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "failed to get subject mode: ")
	}

	return connect.NewResponse(&v1alpha1.GetSchemaRegistrySubjectModeResponse{
		Mode: res.Mode,
	}), nil
}

// SetSchemaRegistrySubjectMode sets the mode for a specific subject.
func (s *Service) SetSchemaRegistrySubjectMode(ctx context.Context, req *connect.Request[v1alpha1.SetSchemaRegistrySubjectModeRequest]) (*connect.Response[v1alpha1.SetSchemaRegistrySubjectModeResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	mode, err := parseMode(req.Msg.GetMode())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	res, err := s.consoleSvc.PutSchemaRegistryMode(ctx, mode, req.Msg.GetSubject())
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "failed to set subject mode: ")
	}

	return connect.NewResponse(&v1alpha1.SetSchemaRegistrySubjectModeResponse{
		Mode: res.Mode,
	}), nil
}

// DeleteSchemaRegistrySubjectMode deletes the mode override for a specific subject.
func (s *Service) DeleteSchemaRegistrySubjectMode(ctx context.Context, req *connect.Request[v1alpha1.DeleteSchemaRegistrySubjectModeRequest]) (*connect.Response[v1alpha1.DeleteSchemaRegistrySubjectModeResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	err := s.consoleSvc.DeleteSchemaRegistrySubjectMode(ctx, req.Msg.GetSubject())
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "failed to delete subject mode: ")
	}

	return connect.NewResponse(&v1alpha1.DeleteSchemaRegistrySubjectModeResponse{}), nil
}

// GetSchemaRegistryConfig returns the global schema registry compatibility configuration.
func (s *Service) GetSchemaRegistryConfig(ctx context.Context, _ *connect.Request[v1alpha1.GetSchemaRegistryConfigRequest]) (*connect.Response[v1alpha1.GetSchemaRegistryConfigResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	res, err := s.consoleSvc.GetSchemaRegistryConfig(ctx, "")
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "failed to get schema registry config: ")
	}

	return connect.NewResponse(&v1alpha1.GetSchemaRegistryConfigResponse{
		Compatibility: res.Compatibility.String(),
	}), nil
}

// SetSchemaRegistryConfig sets the global schema registry compatibility configuration.
func (s *Service) SetSchemaRegistryConfig(ctx context.Context, req *connect.Request[v1alpha1.SetSchemaRegistryConfigRequest]) (*connect.Response[v1alpha1.SetSchemaRegistryConfigResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	compat, err := parseCompatibility(req.Msg.GetCompatibility())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	res, err := s.consoleSvc.PutSchemaRegistryConfig(ctx, "", sr.SetCompatibility{Level: compat})
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "failed to set schema registry config: ")
	}

	return connect.NewResponse(&v1alpha1.SetSchemaRegistryConfigResponse{
		Compatibility: res.Compatibility.String(),
	}), nil
}

// GetSchemaRegistrySubjectConfig returns the compatibility configuration for a specific subject.
func (s *Service) GetSchemaRegistrySubjectConfig(ctx context.Context, req *connect.Request[v1alpha1.GetSchemaRegistrySubjectConfigRequest]) (*connect.Response[v1alpha1.GetSchemaRegistrySubjectConfigResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	res, err := s.consoleSvc.GetSchemaRegistryConfig(ctx, req.Msg.GetSubject())
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "failed to get subject config: ")
	}

	return connect.NewResponse(&v1alpha1.GetSchemaRegistrySubjectConfigResponse{
		Compatibility: res.Compatibility.String(),
	}), nil
}

// SetSchemaRegistrySubjectConfig sets the compatibility configuration for a specific subject.
func (s *Service) SetSchemaRegistrySubjectConfig(ctx context.Context, req *connect.Request[v1alpha1.SetSchemaRegistrySubjectConfigRequest]) (*connect.Response[v1alpha1.SetSchemaRegistrySubjectConfigResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	compat, err := parseCompatibility(req.Msg.GetCompatibility())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	res, err := s.consoleSvc.PutSchemaRegistryConfig(ctx, req.Msg.GetSubject(), sr.SetCompatibility{Level: compat})
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "failed to set subject config: ")
	}

	return connect.NewResponse(&v1alpha1.SetSchemaRegistrySubjectConfigResponse{
		Compatibility: res.Compatibility.String(),
	}), nil
}

// DeleteSchemaRegistrySubjectConfig deletes the compatibility configuration override for a specific subject.
func (s *Service) DeleteSchemaRegistrySubjectConfig(ctx context.Context, req *connect.Request[v1alpha1.DeleteSchemaRegistrySubjectConfigRequest]) (*connect.Response[v1alpha1.DeleteSchemaRegistrySubjectConfigResponse], error) {
	if !s.cfg.SchemaRegistry.Enabled {
		return nil, apierrors.NewSchemaRegistryNotConfiguredError()
	}

	err := s.consoleSvc.DeleteSchemaRegistrySubjectConfig(ctx, req.Msg.GetSubject())
	if err != nil {
		return nil, apierrors.NewConnectErrorFromSchemaRegistryError(err, "failed to delete subject config: ")
	}

	return connect.NewResponse(&v1alpha1.DeleteSchemaRegistrySubjectConfigResponse{}), nil
}

// parseMode parses a mode string into an sr.Mode.
func parseMode(modeStr string) (sr.Mode, error) {
	var mode sr.Mode
	if err := mode.UnmarshalText([]byte(modeStr)); err != nil {
		return 0, fmt.Errorf("invalid mode %q: %w", modeStr, err)
	}
	return mode, nil
}

// parseCompatibility parses a compatibility string into an sr.CompatibilityLevel.
func parseCompatibility(compatStr string) (sr.CompatibilityLevel, error) {
	var compat sr.CompatibilityLevel
	if err := compat.UnmarshalText([]byte(compatStr)); err != nil {
		return 0, fmt.Errorf("invalid compatibility level %q: %w", compatStr, err)
	}
	return compat, nil
}
