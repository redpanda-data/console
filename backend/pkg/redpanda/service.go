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
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/redpanda-data/common-go/net"
	adminapi "github.com/redpanda-data/common-go/rpadmin"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/backoff"
	"github.com/redpanda-data/console/backend/pkg/config"
)

// RedpandaFeature is an enum for various Redpanda capabilities we care about.
//
//nolint:revive // Yes it stutters.
type RedpandaFeature string

const (
	// RedpandaFeatureRBAC represents RBAC feature.
	RedpandaFeatureRBAC RedpandaFeature = "redpanda_feature_rbac"

	// RedpandaFeatureWASMDataTransforms represents WASM data transforms feature.
	RedpandaFeatureWASMDataTransforms RedpandaFeature = "redpanda_feature_wasm_data_transforms"

	// RedpandaFeatureDebugBundle represents debug bundle Admin API feature.
	RedpandaFeatureDebugBundle RedpandaFeature = "redpanda_feature_debug_bundle"
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
	tlsCfg, err := cfg.AdminAPI.TLS.TLSConfig()
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
		return nil, fmt.Errorf("failed to test redpanda admin api connection: %w", err)
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

// BrokerIDToURL resolves the URL of the broker with the given ID.
func (s *Service) BrokerIDToURL(ctx context.Context, brokerID int) (string, error) {
	return s.adminClient.BrokerIDToURL(ctx, brokerID)
}

// GetHealthOverview gets the cluster health overview.
func (s *Service) GetHealthOverview(ctx context.Context) (adminapi.ClusterHealthOverview, error) {
	return s.adminClient.GetHealthOverview(ctx)
}

// GetBrokers retrieves the brokers.
func (s *Service) GetBrokers(ctx context.Context) ([]adminapi.Broker, error) {
	return s.adminClient.Brokers(ctx)
}

// MountTopics mounts topics according to the provided configuration.
func (s *Service) MountTopics(ctx context.Context, config adminapi.MountConfiguration) (adminapi.MigrationInfo, error) {
	return s.adminClient.MountTopics(ctx, config)
}

// UnmountTopics unmounts topics according to the provided configuration.
func (s *Service) UnmountTopics(ctx context.Context, config adminapi.UnmountConfiguration) (adminapi.MigrationInfo, error) {
	return s.adminClient.UnmountTopics(ctx, config)
}

// ListMountableTopics retrieves a list of topics that can be mounted from cloud storage.
func (s *Service) ListMountableTopics(ctx context.Context) (adminapi.ListMountableTopicsResponse, error) {
	return s.adminClient.ListMountableTopics(ctx)
}

// ListMountTasks returns a list of all ongoing mount, and unmount operations.
func (s *Service) ListMountTasks(ctx context.Context) ([]adminapi.MigrationState, error) {
	return s.adminClient.ListMigrations(ctx)
}

// GetMountTask describes the state of the requested mount task.
func (s *Service) GetMountTask(ctx context.Context, id int) (adminapi.MigrationState, error) {
	return s.adminClient.GetMigration(ctx, id)
}

// DeleteMountTask removes a mount task.
func (s *Service) DeleteMountTask(ctx context.Context, id int) error {
	return s.adminClient.DeleteMigration(ctx, id)
}

// UpdateMountTask executes a migration action (e.g. cancel) on the given mount or unmount task.
func (s *Service) UpdateMountTask(ctx context.Context, id int, action adminapi.MigrationAction) error {
	return s.adminClient.ExecuteMigration(ctx, id, action)
}

// CheckFeature checks whether redpanda has the specified feature in the specified state.
// Multiple states can be passed to check if feature state is any one of the given states.
// For example if "active" OR "available".
func (s *Service) CheckFeature(ctx context.Context, feature RedpandaFeature) bool {
	switch feature {
	case RedpandaFeatureRBAC:
		_, err := s.ListRoles(ctx, "", "", "")
		if err != nil {
			return false
		}
		return true
	case RedpandaFeatureWASMDataTransforms:
		_, err := s.ListWasmTransforms(ctx)
		if err != nil {
			return false
		}
		return true
	case RedpandaFeatureDebugBundle:
		_, err := s.adminClient.GetDebugBundleStatus(ctx)
		if err != nil {
			var httpErr *adminapi.HTTPResponseError
			if errors.As(err, &httpErr) {
				if httpErr.Response.StatusCode == http.StatusNotFound {
					return false
				}
			}
		}
		return true
	default:
		return false
	}
}
