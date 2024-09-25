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
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/license"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

// Ensure that Service implements the LicenseServiceHandler interface.
var _ consolev1alpha1connect.LicenseServiceHandler = (*Service)(nil)

// Service that implements the UserServiceHandler interface. This includes all
// RPCs to manage Redpanda or Kafka users.
type Service struct {
	logger         *zap.Logger
	adminapiCl     *rpadmin.AdminAPI
	consoleLicense license.License
	mapper         mapper
}

// NewService creates a new instance of Service, initializing it with the
// provided configuration, logger, and hooks. It returns an error if the admin
// client setup fails.
func NewService(
	logger *zap.Logger,
	cfg *config.Config,
	consoleLicense license.License,
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
	}, nil
}

// ListLicenses retrieves the licenses associated with the Redpanda console and
// cluster. It requires the requester to be authenticated and have the necessary
// permissions.
func (s Service) ListLicenses(ctx context.Context, _ *connect.Request[v1alpha1.ListLicensesRequest]) (*connect.Response[v1alpha1.ListLicensesResponse], error) {
	// TODO: Ensure endpoint is authorized

	if s.adminapiCl == nil {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	licenses := make([]*v1alpha1.License, 0)
	consoleLicenseProto := s.mapper.consoleLicenseToProto(s.consoleLicense)
	licenses = append(licenses, consoleLicenseProto)

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

	// Mapping will work fine even if the request error'd because the defaults
	// will map to a community license.
	coreProtoLicense := s.mapper.adminAPILicenseInformationToProto(coreLicense)
	licenses = append(licenses, coreProtoLicense)

	return connect.NewResponse(&v1alpha1.ListLicensesResponse{Licenses: licenses}), nil
}

// SetLicense installs a new license into the Redpanda cluster.
// The requester must be authenticated and have the necessary permissions.
func (s Service) SetLicense(ctx context.Context, req *connect.Request[v1alpha1.SetLicenseRequest]) (*connect.Response[v1alpha1.SetLicenseResponse], error) {
	// TODO: Ensure endpoint is authorized

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
