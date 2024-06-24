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

	"github.com/redpanda-data/common-go/net"
	adminapi "github.com/redpanda-data/common-go/rpadmin"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/backoff"
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

	// Ensure Redpanda connection works, otherwise fail fast. Allow up to 5 retries with exponentially increasing backoff.
	// Retries with backoff is very helpful in environments where Console concurrently starts with the Kafka target,
	// such as a docker-compose demo.
	eb := backoff.ExponentialBackoff{
		BaseInterval: cfg.AdminAPI.Startup.RetryInterval,
		MaxInterval:  cfg.AdminAPI.Startup.MaxRetryInterval,
		Multiplier:   cfg.AdminAPI.Startup.BackoffMultiplier,
	}

	attempt := 0

	for attempt < cfg.AdminAPI.Startup.MaxRetries && cfg.AdminAPI.Startup.EstablishConnectionEagerly {
		_, err = getClusterVersion(logger, adminClient, cfg.AdminAPI.URLs, time.Second*5)
		if err == nil {
			break
		}

		backoffDuration := eb.Backoff(attempt)

		logger.Warn(
			fmt.Sprintf("Failed to test Redpanda Admin connection, going to retry in %vs", backoffDuration.Seconds()),
			zap.Int("remaining_retries", cfg.AdminAPI.Startup.MaxRetries-attempt),
		)

		attempt++
		time.Sleep(backoffDuration)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to test kafka connection: %w", err)
	}

	return &Service{
		adminClient: adminClient,
		logger:      logger,
	}, nil
}

func getClusterVersion(logger *zap.Logger, adminClient *adminapi.AdminAPI, adminURLs []string, timeout time.Duration) (string, error) {
	// Test admin client connectivity so that we can give an early user feedback
	// about the connection.
	logger.Info("testing admin client connectivity", zap.Strings("urls", adminURLs))

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	brokers, err := adminClient.Brokers(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to test admin client connectivity: %w", err)
	}

	clusterVersion := ClusterVersionFromBrokerList(brokers)
	logger.Info("successfully tested the Redpanda admin connectivity",
		zap.Int("broker_count", len(brokers)),
		zap.String("cluster_version", clusterVersion))

	return clusterVersion, nil
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

// ListWasmTransforms lists all wasm transforms in the Redpanda cluster.
func (s *Service) ListWasmTransforms(ctx context.Context) ([]adminapi.TransformMetadata, error) {
	return s.adminClient.ListWasmTransforms(ctx)
}

// DeployWasmTransform deploys a wasm transform to the Redpanda cluster.
func (s *Service) DeployWasmTransform(ctx context.Context, t adminapi.TransformMetadata, file []byte) error {
	return s.adminClient.DeployWasmTransform(ctx, t, bytes.NewReader(file))
}

// DeleteWasmTransform deletes a wasm transform from the Redpanda cluster
func (s *Service) DeleteWasmTransform(ctx context.Context, name string) error {
	return s.adminClient.DeleteWasmTransform(ctx, name)
}

// ListRoles lists all roles in the Redpanda cluster.
func (s *Service) ListRoles(ctx context.Context, prefix, principal, principalType string) (adminapi.RolesResponse, error) {
	return s.adminClient.Roles(ctx, prefix, principal, principalType)
}

// CreateRole creates a new role in the Redpanda cluster.
func (s *Service) CreateRole(ctx context.Context, name string) (adminapi.CreateRole, error) {
	return s.adminClient.CreateRole(ctx, name)
}

// DeleteRole deletes a Role in Redpanda with the given name. If deleteACL is
// true, Redpanda will delete ACLs bound to the role.
func (s *Service) DeleteRole(ctx context.Context, name string, deleteACL bool) error {
	return s.adminClient.DeleteRole(ctx, name, deleteACL)
}

// AssignRole assign the role 'roleName' to the passed members.
func (s *Service) AssignRole(ctx context.Context, roleName string, add []adminapi.RoleMember) (adminapi.PatchRoleResponse, error) {
	return s.adminClient.AssignRole(ctx, roleName, add)
}

// UnassignRole unassigns the role 'roleName' from the passed members.
func (s *Service) UnassignRole(ctx context.Context, roleName string, remove []adminapi.RoleMember) (adminapi.PatchRoleResponse, error) {
	return s.adminClient.UnassignRole(ctx, roleName, remove)
}

// RoleMembers returns the list of RoleMembers of a given role.
func (s *Service) RoleMembers(ctx context.Context, roleName string) (adminapi.RoleMemberResponse, error) {
	return s.adminClient.RoleMembers(ctx, roleName)
}

// GetRole returns the role.
func (s *Service) GetRole(ctx context.Context, roleName string) (adminapi.RoleDetailResponse, error) {
	return s.adminClient.Role(ctx, roleName)
}

// UpdateRoleMembership updates the role membership using Redpanda Admin API.
func (s *Service) UpdateRoleMembership(ctx context.Context, roleName string, add, remove []adminapi.RoleMember, createRole bool) (adminapi.PatchRoleResponse, error) {
	return s.adminClient.UpdateRoleMembership(ctx, roleName, add, remove, createRole)
}

// CheckFeature checks whether redpanda has the specified feature in the specified state.
// Multiple states can be passed to check if feature state is any one of the given states.
// For example if "active" OR "available".
func (s *Service) CheckFeature(ctx context.Context, feature string, states []adminapi.FeatureState) (bool, error) {
	fr, err := s.adminClient.GetFeatures(ctx)
	if err != nil {
		return false, err
	}

	match := false
	for _, f := range fr.Features {
		if f.Name == feature {
			for _, s := range states {
				if s == f.State {
					match = true
					break
				}
			}

			break
		}
	}

	return match, nil
}
