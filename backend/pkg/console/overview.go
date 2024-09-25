// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"

	adminapi "github.com/redpanda-data/common-go/rpadmin"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/license"
	"github.com/redpanda-data/console/backend/pkg/version"
)

// Overview contains information to give a high-level overview
// about the cluster we are connected to along with all it's ecosystem components,
// such as Kafka Connect, Schema Registry etc. The returned information will be
// rendered on Console's overview page.
type Overview struct {
	Kafka          OverviewKafka          `json:"kafka"`
	Redpanda       OverviewRedpanda       `json:"redpanda"`
	Console        OverviewConsole        `json:"console"`
	KafkaConnect   OverviewKafkaConnect   `json:"kafkaConnect,omitempty"`
	SchemaRegistry OverviewSchemaRegistry `json:"schemaRegistry"`
}

// OverviewRedpanda contains information that can be received via Redpanda's
// admin API.
type OverviewRedpanda struct {
	IsAdminAPIConfigured    bool                              `json:"isAdminApiConfigured"`
	License                 *license.License                  `json:"license,omitempty"`
	Version                 string                            `json:"version,omitempty"`
	UserCount               *int                              `json:"userCount,omitempty"`
	PartitionBalancerStatus *adminapi.PartitionBalancerStatus `json:"partitionBalancerStatus,omitempty"`
}

// OverviewConsole contains information about Redpanda Console itself.
type OverviewConsole struct {
	Version string `json:"version"`
	BuiltAt string `json:"builtAt"`
}

// ClusterOverviewKafkaStorage provides details about the storage that is used for
// the Kafka log dirs.
type ClusterOverviewKafkaStorage struct {
	// TotalUsedBytes is the total storage used across all brokers, disks,
	// remote storage etc. and includes replicated bytes.
	TotalUsedBytes int64 `json:"totalUsedBytes"`

	// TotalUsedPrimaryBytes is like TotalUsedBytes but excludes replicated bytes.
	TotalUsedPrimaryBytes int64 `json:"totalUsedPrimaryBytes"`
}

// OverviewKafkaConnect provides information for all configured Kafka connect clusters.
type OverviewKafkaConnect struct {
	IsConfigured bool                          `json:"isConfigured"`
	Clusters     []OverviewKafkaConnectCluster `json:"clusters,omitempty"`
}

// OverviewKafkaConnectCluster is the overview information for a single configured Kafka
// connect cluster.
type OverviewKafkaConnectCluster struct {
	// Name is the Kafka connect cluster name that is used in Console's configuration.
	Name string `json:"name"`
	OverviewStatus
	Host             string `json:"host"`
	Version          string `json:"version"`
	InstalledPlugins int    `json:"installedPlugins"`
}

// OverviewSchemaRegistry provides information for the schema registry that is configured
// in Redpanda Console.
type OverviewSchemaRegistry struct {
	OverviewStatus
	IsConfigured       bool `json:"isConfigured"`
	RegisteredSubjects int  `json:"registeredSubjects"`
}

// GetOverview talks to multiple APIs in parallel in order to collect
// the required information to return ClusterOverview.
func (s *Service) GetOverview(ctx context.Context) Overview {
	return Overview{
		Kafka:          s.getKafkaOverview(ctx),
		Redpanda:       s.getRedpandaOverview(ctx),
		Console:        s.getConsoleOverview(),
		KafkaConnect:   s.getConnectOverview(ctx),
		SchemaRegistry: s.getSchemaRegistryOverview(ctx),
	}
}

func (s *Service) getRedpandaOverview(ctx context.Context) OverviewRedpanda {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return OverviewRedpanda{
			IsAdminAPIConfigured: false,
		}
	}
	redpandaCl, err := s.redpandaClientFactory.GetRedpandaAPIClient(ctx)
	if err != nil {
		return OverviewRedpanda{
			IsAdminAPIConfigured: false,
		}
	}

	version, _ := s.redpandaClusterVersion(ctx, redpandaCl)

	var userCount *int
	users, err := redpandaCl.ListUsers(ctx)
	if err != nil {
		s.logger.Warn("failed to list users via redpanda admin api", zap.Error(err))
	} else {
		userCount = new(int)
		*userCount = len(users)
	}

	var partitionBalancerStatus *adminapi.PartitionBalancerStatus
	pbs, err := redpandaCl.GetPartitionStatus(ctx)
	if err != nil {
		s.logger.Warn("failed to retrieve partition balancer status", zap.Error(err))
	} else {
		partitionBalancerStatus = &pbs
	}

	return OverviewRedpanda{
		IsAdminAPIConfigured:    true,
		Version:                 version,
		UserCount:               userCount,
		PartitionBalancerStatus: partitionBalancerStatus,
	}
}

func (*Service) getConsoleOverview() OverviewConsole {
	return OverviewConsole{
		Version: version.Version,
		BuiltAt: version.BuiltAt,
	}
}

func (s *Service) getSchemaRegistryOverview(ctx context.Context) OverviewSchemaRegistry {
	if !s.cfg.SchemaRegistry.Enabled {
		return OverviewSchemaRegistry{
			IsConfigured: false,
		}
	}

	status := OverviewStatus{
		Status: StatusTypeHealthy,
	}

	srClient, err := s.schemaClientFactory.GetSchemaRegistryClient(ctx)
	if err != nil {
		status.SetStatus(StatusTypeUnhealthy, fmt.Sprintf("Failed to get schema registry client: %v", err.Error()))
		return OverviewSchemaRegistry{
			OverviewStatus: status,
			IsConfigured:   s.cfg.SchemaRegistry.Enabled,
		}
	}

	registeredSubjects := 0
	subjects, err := srClient.Subjects(ctx)
	if err != nil {
		status.SetStatus(StatusTypeUnhealthy, fmt.Sprintf("Could not fetch subjects from schema registry %q", err.Error()))
	} else {
		registeredSubjects = len(subjects)
	}
	return OverviewSchemaRegistry{
		OverviewStatus:     status,
		IsConfigured:       s.cfg.SchemaRegistry.Enabled,
		RegisteredSubjects: registeredSubjects,
	}
}

func (s *Service) getConnectOverview(ctx context.Context) OverviewKafkaConnect {
	// Currently the connectSvc is always configured, even if it's not enabled.
	// The connectSvc itself will then return errors if you request resources in
	// case it hasn't been enabled in the configuration. Hence, we have to check
	// whether the Kafka connect config is enabled.
	if s.connectSvc == nil || !s.connectSvc.Cfg.Enabled {
		return OverviewKafkaConnect{
			IsConfigured: false,
		}
	}

	// Get cluster info from all clusters
	clustersInfo := s.connectSvc.GetAllClusterInfo(ctx)
	clustersOverview := make([]OverviewKafkaConnectCluster, len(clustersInfo))

	for i, clusterInfo := range clustersInfo {
		clustersOverview[i] = OverviewKafkaConnectCluster{
			Name:             clusterInfo.Name,
			OverviewStatus:   OverviewStatus{},
			Host:             clusterInfo.Host,
			Version:          clusterInfo.Version,
			InstalledPlugins: len(clusterInfo.Plugins),
		}
	}
	return OverviewKafkaConnect{
		IsConfigured: true,
		Clusters:     clustersOverview,
	}
}
