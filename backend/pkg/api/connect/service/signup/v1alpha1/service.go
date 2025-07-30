// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package signup provides functionality for managing license signups,
// including generating trial licenses for new users via a service that
// implements the SignupServiceHandler interface.
package signup

import (
	"context"
	"net/http"
	"strings"

	"buf.build/gen/go/redpandadata/gatekeeper/connectrpc/go/redpanda/api/gatekeeper/v1alpha1/gatekeeperv1alpha1connect"
	gatekeeperv1alpha1 "buf.build/gen/go/redpandadata/gatekeeper/protocolbuffers/go/redpanda/api/gatekeeper/v1alpha1"
	"connectrpc.com/connect"
	"github.com/google/uuid"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

// Ensure that Service implements the SignupServiceHandler interface.
var _ consolev1alpha1connect.SignupServiceHandler = (*Service)(nil)

// Service that implements the SignupServiceHandler interface. This includes all
// RPCs to manage license signups.
type Service struct {
	logger                 *zap.Logger
	gatekeeperClient       gatekeeperv1alpha1connect.EnterpriseServiceClient
	redpandaClientProvider redpandafactory.ClientFactory
}

// NewService creates a new instance of Service, initializing it with the
// provided logger and gatekeeper client.
func NewService(logger *zap.Logger, gatekeeperBaseURL string) (*Service, error) {
	gatekeeperClient := gatekeeperv1alpha1connect.NewEnterpriseServiceClient(
		http.DefaultClient,
		gatekeeperBaseURL,
	)

	return &Service{
		logger:           logger,
		gatekeeperClient: gatekeeperClient,
	}, nil
}

// LicenseSignup processes a license signup request by forwarding it to the gatekeeper service.
// This endpoint forwards the signup request to the external gatekeeper service and returns the response.
func (s Service) LicenseSignup(ctx context.Context, req *connect.Request[v1alpha1.LicenseSignupRequest]) (*connect.Response[v1alpha1.LicenseSignupResponse], error) {
	s.logger.Info("forwarding license signup request to gatekeeper",
		zap.String("email", req.Msg.GetEmail()),
		zap.String("company_name", req.Msg.GetCompanyName()),
		zap.String("given_name", req.Msg.GetGivenName()),
		zap.String("family_name", req.Msg.GetFamilyName()))

	adminCl, err := s.redpandaClientProvider.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	// Create gatekeeper request
	gatekeeperReq := &gatekeeperv1alpha1.LicenseSignupRequest{
		GivenName:   req.Msg.GetGivenName(),
		FamilyName:  req.Msg.GetFamilyName(),
		CompanyName: req.Msg.GetCompanyName(),
		Email:       req.Msg.GetEmail(),
		ClusterInfo: &gatekeeperv1alpha1.EnterpriseClusterInfo{
			ClusterId: uuid.Nil.String(), // TODO: fetch the actual cluster_id
			Platform:  gatekeeperv1alpha1.EnterpriseClusterInfo_PLATFORM_REDPANDA,
		},
		RequestOrigin: gatekeeperv1alpha1.LicenseSignupRequest_REQUEST_ORIGIN_CONSOLE,
	}

	// Forward to gatekeeper service
	gatekeeperResp, err := s.gatekeeperClient.LicenseSignup(ctx, connect.NewRequest(gatekeeperReq))
	if err != nil {
		s.logger.Error("failed to forward signup request to gatekeeper", zap.Error(err))
		return nil, err
	}

	licenseInput := strings.NewReader(gatekeeperResp.Msg.GetLicense().GetLicenseKey())
	if err := adminCl.SetLicense(ctx, licenseInput); err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to install license: ")
	}

	// Map gatekeeper response to console response
	consoleResp := &v1alpha1.LicenseSignupResponse{
		License: &v1alpha1.LicenseSignupResponse_License{
			LicenseKey: gatekeeperResp.Msg.GetLicense().GetLicenseKey(),
			Expiration: gatekeeperResp.Msg.GetLicense().GetExpiration(),
		},
	}

	s.logger.Info("license signup completed successfully via gatekeeper",
		zap.String("email", req.Msg.GetEmail()),
		zap.String("license_key", consoleResp.License.GetLicenseKey()))

	return connect.NewResponse(consoleResp), nil
}
