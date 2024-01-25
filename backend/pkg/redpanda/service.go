// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package redpanda

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"
	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/net"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// Service is the abstraction for communicating with a Redpanda cluster via the admin api.
type Service struct {
	adminClient *adminapi.AdminAPI
	logger      *zap.Logger
}

// NewService creates a new redpanda.Service. It creates a Redpanda admin client based
// on the authentication information provided in the configuration.
func NewService(cfg config.Redpanda, logger *zap.Logger) (*Service, error) {
	if !cfg.AdminAPI.Enabled {
		return nil, nil
	}

	// Build admin client with provided credentials
	var auth adminapi.Auth
	if cfg.AdminAPI.Username != "" {
		auth = &adminapi.BasicAuth{
			Username: cfg.AdminAPI.Username,
			Password: cfg.AdminAPI.Password,
		}
	} else {
		auth = &adminapi.NopAuth{}
	}
	tlsCfg, err := cfg.AdminAPI.TLS.BuildTLSConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to build TLS config: %w", err)
	}

	// Explicitly set the tlsCfg to nil in case an HTTP target url has been provided
	scheme, _, err := net.ParseHostMaybeScheme(cfg.AdminAPI.URLs[0])
	if err != nil {
		return nil, fmt.Errorf("failed to parse admin api url scheme: %w", err)
	}
	if scheme == "http" {
		tlsCfg = nil
	}

	adminClient, err := adminapi.NewAdminAPI(cfg.AdminAPI.URLs, auth, tlsCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create admin client: %w", err)
	}

	// Test admin client connectivity so that we can give an early user feedback
	// about the connection.
	logger.Info("testing admin client connectivity", zap.Strings("urls", cfg.AdminAPI.URLs))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	brokers, err := adminClient.Brokers(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to test admin client connectivity: %w", err)
	}

	clusterVersion := ClusterVersionFromBrokerList(brokers)
	logger.Info("successfully tested the Redpanda admin connectivity",
		zap.Int("broker_count", len(brokers)),
		zap.String("cluster_version", clusterVersion))

	return &Service{
		adminClient: adminClient,
		logger:      logger,
	}, nil
}

// CreateUser creates a new user (also known as principal) in the Redpanda cluster.
func (s *Service) CreateUser(ctx context.Context, username, password, mechanism string) error {
	err := s.adminClient.CreateUser(ctx, username, password, mechanism)
	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}
	return nil
}

// UpdateUser updates a user with the given username and password using the given
// mechanism (SCRAM-SHA-256, SCRAM-SHA-512). The api call will error out if no
// default mechanism is given.
func (s *Service) UpdateUser(ctx context.Context, username, password, mechanism string) error {
	err := s.adminClient.UpdateUser(ctx, username, password, mechanism)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}
	return nil
}

// DeleteUser deletes a user (also known as principal) from the Redpanda cluster.
func (s *Service) DeleteUser(ctx context.Context, username string) error {
	err := s.adminClient.DeleteUser(ctx, username)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	return nil
}

// ListUsers lists all users (also known as principals) in the Redpanda cluster.
func (s *Service) ListUsers(ctx context.Context) ([]string, error) {
	users, err := s.adminClient.ListUsers(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	return users, nil
}

// GetClusterVersion retrieves the target cluster's release version.
func (s *Service) GetClusterVersion(ctx context.Context) (string, error) {
	brokers, err := s.adminClient.Brokers(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get broker list: %w", err)
	}
	return ClusterVersionFromBrokerList(brokers), nil
}

// GetLicense retrieves the target cluster's license information.
func (s *Service) GetLicense(ctx context.Context) License {
	l, err := s.adminClient.GetLicenseInfo(ctx)
	if err != nil {
		// This might be because the target Redpanda cluster has not yet implemented the endpoint
		// to request license information from, hence log at debug level only.
		s.logger.Debug("failed to get license info", zap.Error(err))
		return newOpenSourceCoreLicense()
	}

	decoded, err := licenseToRedpandaLicense(l)
	if err != nil {
		s.logger.Warn("failed to decode redpanda cluster license", zap.Error(err))
		return newOpenSourceCoreLicense()
	}

	return decoded
}

// GetPartitionBalancerStatus retrieves the partition balancer status from Redpanda
// via the Admin API.
func (s *Service) GetPartitionBalancerStatus(ctx context.Context) (adminapi.PartitionBalancerStatus, error) {
	return s.adminClient.GetPartitionStatus(ctx)
}

func licenseToRedpandaLicense(license adminapi.License) (License, error) {
	if !license.Loaded {
		return newOpenSourceCoreLicense(), nil
	}

	switch license.Properties.Type {
	case string(LicenseTypeFreeTrial), string(LicenseTypeEnterprise):
	default:
		return License{}, fmt.Errorf("unknown license type: %s", license.Properties.Type)
	}

	return License{
		Source:    LicenseSourceRedpanda,
		Type:      LicenseType(license.Properties.Type),
		ExpiresAt: license.Properties.Expires,
	}, nil
}

// ClusterVersionFromBrokerList returns the version of the Redpanda cluster. Since each broker
// reports the version individually, we iterate through the list of brokers and
// return the first reported version that contains a semVer.
func ClusterVersionFromBrokerList(brokers []adminapi.Broker) string {
	version := "unknown"
	for _, broker := range brokers {
		if broker.Version != "" {
			// Broker version may look like this: "v22.1.4 - 491e56900d2316fcbb22aa1d37e7195897878309"
			brokerVersion := strings.Split(broker.Version, " ")
			if len(brokerVersion) > 0 {
				version = "Redpanda " + brokerVersion[0]
				break
			}
		}
	}
	return version
}

func (s *Service) ListWasmTransforms(ctx context.Context) ([]adminapi.TransformMetadata, error) {
	return s.adminClient.ListWasmTransforms(ctx)
}

func (s *Service) DeployWasmTransform(ctx context.Context, t adminapi.TransformMetadata, file []byte) error {
	return s.adminClient.DeployWasmTransform(ctx, t, bytes.NewReader(file))
}

func (s *Service) DeleteWasmTransform(ctx context.Context, name string) error {
	return s.adminClient.DeleteWasmTransform(ctx, name)
}
