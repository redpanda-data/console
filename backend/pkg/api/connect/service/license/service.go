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
	"log/slog"
	"strings"

	"connectrpc.com/connect"
	"github.com/redpanda-data/common-go/rpadmin"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	"github.com/redpanda-data/console/backend/pkg/license"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

// Ensure that Service implements the LicenseServiceHandler interface.
var _ consolev1alpha1connect.LicenseServiceHandler = (*Service)(nil)

// Service that implements the UserServiceHandler interface. This includes all
// RPCs to manage Redpanda or Kafka users.
type Service struct {
	logger                 *slog.Logger
	redpandaClientProvider redpandafactory.ClientFactory
	consoleLicense         license.License
	mapper                 mapper
}

// NewService creates a new instance of Service, initializing it with the
// provided configuration, logger, and hooks. It returns an error if the admin
// client setup fails.
func NewService(
	logger *slog.Logger,
	redpandaClientProvider redpandafactory.ClientFactory,
	consoleLicense license.License,
) (*Service, error) {
	return &Service{
		logger:                 logger,
		redpandaClientProvider: redpandaClientProvider,
		consoleLicense:         consoleLicense,
		mapper:                 mapper{},
	}, nil
}

// ListLicenses retrieves the licenses associated with the Redpanda console and
// cluster. It requires the requester to be authenticated and have the necessary
// permissions.
func (s Service) ListLicenses(ctx context.Context, _ *connect.Request[v1alpha1.ListLicensesRequest]) (*connect.Response[v1alpha1.ListLicensesResponse], error) {
	consoleLicenseProto := s.mapper.consoleLicenseToProto(s.consoleLicense)
	licenses := []*v1alpha1.License{consoleLicenseProto}

	adminCl, err := s.redpandaClientProvider.GetRedpandaAPIClient(ctx)
	if err != nil {
		//nolint:nilerr // We actually don't want to return an error hee, but a default response.
		return connect.NewResponse(&v1alpha1.ListLicensesResponse{Licenses: licenses, Violation: false}), nil
	}

	coreLicense, err := adminCl.GetLicenseInfo(ctx)
	if err != nil {
		var httpErr *rpadmin.HTTPResponseError
		if errors.As(err, &httpErr) {
			errStr := err.Error()
			errorBody, err := httpErr.DecodeGenericErrorBody()
			if err == nil {
				errStr = errorBody.Message
			}

			s.logger.InfoContext(ctx, "failed to retrieve license info from Redpanda cluster",
				slog.Int("status_code", httpErr.Response.StatusCode),
				slog.String("message", errStr))
		} else {
			s.logger.InfoContext(ctx, "failed to retrieve license info from Redpanda cluster", slog.Any("error", err))
		}
	}

	isViolation := false
	enterpriseFeatures, err := adminCl.GetEnterpriseFeatures(ctx)
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
	adminCl, err := s.redpandaClientProvider.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	licenseInput := strings.NewReader(req.Msg.GetLicense())
	if err := adminCl.SetLicense(ctx, licenseInput); err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to install license: ")
	}

	licenseInfo, err := adminCl.GetLicenseInfo(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to retrieve installed license: ")
	}
	licenseInfoProto := s.mapper.adminAPILicenseInformationToProto(licenseInfo)

	return connect.NewResponse(&v1alpha1.SetLicenseResponse{License: licenseInfoProto}), nil
}

// ListEnterpriseFeatures reports the license status and Redpanda enterprise features in use.
// This can only be reported if the Redpanda Admin API is configured and supports this request.
func (s Service) ListEnterpriseFeatures(ctx context.Context, _ *connect.Request[v1alpha1.ListEnterpriseFeaturesRequest]) (*connect.Response[v1alpha1.ListEnterpriseFeaturesResponse], error) {
	adminCl, err := s.redpandaClientProvider.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	features, err := adminCl.GetEnterpriseFeatures(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to retrieve enterprise features: ")
	}

	featuresProto := s.mapper.enterpriseFeaturesToProto(features)

	return connect.NewResponse(featuresProto), nil
}
