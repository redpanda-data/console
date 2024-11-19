// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package license provides functionality for managing Redpanda or Kafka licenses,
// including listing and setting licenses via a service that implements the
// LicenseServiceHandler interface.
package license

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"connectrpc.com/connect"
	"github.com/redpanda-data/common-go/net"
	"github.com/redpanda-data/common-go/rpadmin"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/api/hooks"
	"github.com/redpanda-data/console/backend/pkg/config"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

// Ensure that Service implements the LicenseServiceHandler interface.
var _ consolev1alpha1connect.LicenseServiceHandler = (*Service)(nil)

// Service that implements the UserServiceHandler interface. This includes all
// RPCs to manage Redpanda or Kafka users.
type Service struct {
	logger         *zap.Logger
	adminapiCl     *rpadmin.AdminAPI
	consoleLicense redpanda.License
	mapper         mapper
	authHooks      hooks.AuthorizationHooks
}

// NewService creates a new instance of Service, initializing it with the
// provided configuration, logger, and hooks. It returns an error if the admin
// client setup fails.
func NewService(
	logger *zap.Logger,
	cfg *config.Config,
	consoleLicense redpanda.License,
	hooks hooks.AuthorizationHooks,
) (*Service, error) {
	var adminClient *rpadmin.AdminAPI

	if cfg.Redpanda.AdminAPI.Enabled {
		// Build admin client with provided credentials
		adminAPICfg := cfg.Redpanda.AdminAPI
		var auth rpadmin.Auth
		if adminAPICfg.Username != "" {
			auth = &rpadmin.BasicAuth{
				Username: adminAPICfg.Username,
				Password: adminAPICfg.Password,
			}
		} else {
			auth = &rpadmin.NopAuth{}
		}
		tlsCfg, err := adminAPICfg.TLS.TLSConfig()
		if err != nil {
			return nil, fmt.Errorf("failed to build TLS config: %w", err)
		}

		// Explicitly set the tlsCfg to nil in case an HTTP target url has been provided
		scheme, _, err := net.ParseHostMaybeScheme(adminAPICfg.URLs[0])
		if err != nil {
			return nil, fmt.Errorf("failed to parse admin api url scheme: %w", err)
		}
		if scheme == "http" {
			tlsCfg = nil
		}

		adminClient, err = rpadmin.NewAdminAPI(adminAPICfg.URLs, auth, tlsCfg)
		if err != nil {
			return nil, fmt.Errorf("failed to create admin client: %w", err)
		}
	}

	return &Service{
		logger:         logger,
		adminapiCl:     adminClient,
		consoleLicense: consoleLicense,
		mapper:         mapper{},
		authHooks:      hooks,
	}, nil
}

// ListLicenses retrieves the licenses associated with the Redpanda console and
// cluster. It requires the requester to be authenticated and have the necessary
// permissions.
func (s Service) ListLicenses(ctx context.Context, _ *connect.Request[v1alpha1.ListLicensesRequest]) (*connect.Response[v1alpha1.ListLicensesResponse], error) {
	// Use this hook to ensure the requester is some authenticated user.
	// It doesn't matter what permissions we check. As long as the requester
	// has at least one viewer permission we know this user is authenticated.
	isAllowed, restErr := s.authHooks.CanViewSchemas(ctx)
	err := apierrors.NewPermissionDeniedConnectError(isAllowed, restErr, "you don't have permissions to list licenses")
	if err != nil {
		return nil, err
	}

	consoleLicenseProto := s.mapper.consoleLicenseToProto(s.consoleLicense)
	licenses := []*v1alpha1.License{consoleLicenseProto}

	if s.adminapiCl == nil {
		return connect.NewResponse(&v1alpha1.ListLicensesResponse{Licenses: licenses, Violation: false}), nil
	}

	coreLicense, err := s.adminapiCl.GetLicenseInfo(ctx)
	if err != nil {
		var httpErr *rpadmin.HTTPResponseError
		if errors.As(err, &httpErr) {
			errStr := err.Error()
			errorBody, err := httpErr.DecodeGenericErrorBody()
			if err == nil {
				errStr = errorBody.Message
			}

			s.logger.Info("failed to retrieve license info from Redpanda cluster",
				zap.Int("status_code", httpErr.Response.StatusCode),
				zap.String("message", errStr))
		} else {
			s.logger.Info("failed to retrieve license info from Redpanda cluster", zap.Error(err))
		}
	}

	isViolation := false
	enterpriseFeatures, err := s.adminapiCl.GetEnterpriseFeatures(ctx)
	if err == nil {
		isViolation = enterpriseFeatures.Violation
	}

	// Mapping will work fine even if the request error'd because the defaults
	// will map to a community license.
	coreProtoLicense := s.mapper.adminAPILicenseInformationToProto(coreLicense)
	licenses = append(licenses, coreProtoLicense)

	return connect.NewResponse(&v1alpha1.ListLicensesResponse{Licenses: licenses, Violation: isViolation}), nil
}

// SetLicense installs a new license into the Redpanda cluster.
// The requester must be authenticated and have the necessary permissions.
func (s Service) SetLicense(ctx context.Context, req *connect.Request[v1alpha1.SetLicenseRequest]) (*connect.Response[v1alpha1.SetLicenseResponse], error) {
	// Use this hook to ensure the requester is some authenticated user.
	// It doesn't matter what permissions we check. As long as the requester
	// has at least one viewer permission we know this user is authenticated.
	isAllowed, restErr := s.authHooks.CanViewSchemas(ctx)
	if err := apierrors.NewPermissionDeniedConnectError(isAllowed, restErr, "you don't have permissions to set a license"); err != nil {
		return nil, err
	}

	if s.adminapiCl == nil {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	licenseInput := strings.NewReader(req.Msg.GetLicense())
	if err := s.adminapiCl.SetLicense(ctx, licenseInput); err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to install license: ")
	}

	licenseInfo, err := s.adminapiCl.GetLicenseInfo(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to retrieve installed license: ")
	}
	licenseInfoProto := s.mapper.adminAPILicenseInformationToProto(licenseInfo)

	return connect.NewResponse(&v1alpha1.SetLicenseResponse{License: licenseInfoProto}), nil
}

// ListEnterpriseFeatures reports the license status and Redpanda enterprise features in use.
// This can only be reported if the Redpanda Admin API is configured and supports this request.
func (s Service) ListEnterpriseFeatures(ctx context.Context, _ *connect.Request[v1alpha1.ListEnterpriseFeaturesRequest]) (*connect.Response[v1alpha1.ListEnterpriseFeaturesResponse], error) {
	// Use this hook to ensure the requester is some authenticated user.
	// It doesn't matter what permissions we check. As long as the requester
	// has at least one viewer permission we know this user is authenticated.
	isAllowed, restErr := s.authHooks.CanViewSchemas(ctx)
	if err := apierrors.NewPermissionDeniedConnectError(isAllowed, restErr, "you don't have permissions to set a license"); err != nil {
		return nil, err
	}

	if s.adminapiCl == nil {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	features, err := s.adminapiCl.GetEnterpriseFeatures(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to retrieve enterprise features: ")
	}

	featuresProto := s.mapper.enterpriseFeaturesToProto(features)

	return connect.NewResponse(featuresProto), nil
}
