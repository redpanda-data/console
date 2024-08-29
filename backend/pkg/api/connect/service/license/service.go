// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package license

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"
	"github.com/redpanda-data/common-go/net"
	"go.uber.org/zap"

	"github.com/redpanda-data/common-go/rpadmin"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/api/hooks"
	"github.com/redpanda-data/console/backend/pkg/config"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

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

func NewService(
	logger *zap.Logger,
	cfg *config.Config,
	consoleLicense redpanda.License,
	hooks hooks.AuthorizationHooks,
) (*Service, error) {
	// Build admin client with provided credentials
	adminApiCfg := cfg.Redpanda.AdminAPI
	var auth rpadmin.Auth
	if adminApiCfg.Username != "" {
		auth = &rpadmin.BasicAuth{
			Username: adminApiCfg.Username,
			Password: adminApiCfg.Password,
		}
	} else {
		auth = &rpadmin.NopAuth{}
	}
	tlsCfg, err := adminApiCfg.TLS.TLSConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to build TLS config: %w", err)
	}

	// Explicitly set the tlsCfg to nil in case an HTTP target url has been provided
	scheme, _, err := net.ParseHostMaybeScheme(adminApiCfg.URLs[0])
	if err != nil {
		return nil, fmt.Errorf("failed to parse admin api url scheme: %w", err)
	}
	if scheme == "http" {
		tlsCfg = nil
	}

	adminClient, err := rpadmin.NewAdminAPI(adminApiCfg.URLs, auth, tlsCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create admin client: %w", err)
	}

	return &Service{
		logger:         logger,
		adminapiCl:     adminClient,
		consoleLicense: consoleLicense,
		mapper:         mapper{},
		authHooks:      hooks,
	}, nil
}

func (s Service) ListLicenses(ctx context.Context, _ *connect.Request[v1alpha1.ListLicensesRequest]) (*connect.Response[v1alpha1.ListLicensesResponse], error) {
	// Use this hook to ensure the requester is some authenticated user.
	// It doesn't matter what permisison we check. As long as the requester
	// has at least one viewer permission we know this user is authenticated.
	isAllowed, restErr := s.authHooks.CanViewSchemas(ctx)
	err := apierrors.NewPermissionDeniedConnectError(isAllowed, restErr, "you don't have permissions to list licenses")
	if err != nil {
		return nil, err
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
	coreProtoLicense := s.mapper.adminApiLicenseInformationToProto(coreLicense)
	licenses = append(licenses, coreProtoLicense)

	return connect.NewResponse(&v1alpha1.ListLicensesResponse{Licenses: licenses}), nil
}

func (s Service) SetLicense(ctx context.Context, req *connect.Request[v1alpha1.SetLicenseRequest]) (*connect.Response[v1alpha1.SetLicenseResponse], error) {
	// Use this hook to ensure the requester is some authenticated user.
	// It doesn't matter what permisison we check. As long as the requester
	// has at least one viewer permission we know this user is authenticated.
	isAllowed, restErr := s.authHooks.CanViewSchemas(ctx)
	err := apierrors.NewPermissionDeniedConnectError(isAllowed, restErr, "you don't have permissions to set a license")
	if err != nil {
		return nil, err
	}

	if s.adminapiCl == nil {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	if err := s.adminapiCl.SetLicense(ctx, req.Msg.GetLicense()); err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to install license: ")
	}

	licenseInfo, err := s.adminapiCl.GetLicenseInfo(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to retrieve installed license: ")
	}
	licenseInfoProto := s.mapper.adminApiLicenseInformationToProto(licenseInfo)

	return connect.NewResponse(&v1alpha1.SetLicenseResponse{License: licenseInfoProto}), nil
}
