// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package redpanda provides interfaces and implementations for interacting with
// Redpanda's Admin API. It includes a client factory interface, `ClientFactory`,
// which abstracts the creation and retrieval of Redpanda Admin API clients.
package redpanda

import (
	"context"
	"io"

	"github.com/redpanda-data/common-go/rpadmin"
)

// ClientFactory defines the interface for creating and retrieving Redpanda API clients.
type ClientFactory interface {
	// GetRedpandaAPIClient retrieves a Redpanda admin API client based on the context.
	GetRedpandaAPIClient(ctx context.Context) (AdminAPIClient, error)
}

// AdminAPIClient defines an interface for the rpadmin.AdminAPI struct, so that
// we can return custom clients for other services that implement the same API
// differently.
type AdminAPIClient interface {
	// CreateUser creates a user with the given username and password using the
	// given mechanism (SCRAM-SHA-256, SCRAM-SHA-512).
	CreateUser(ctx context.Context, username, password, mechanism string) error

	// ListUsers returns the current users.
	ListUsers(ctx context.Context) ([]string, error)

	// UpdateUser updates a user with the given username and password using the
	// given mechanism (SCRAM-SHA-256, SCRAM-SHA-512). The api call will error out
	// if no default mechanism given.
	UpdateUser(ctx context.Context, username, password, mechanism string) error

	// DeleteUser deletes the given username, if it exists.
	DeleteUser(ctx context.Context, username string) error

	// DeployWasmTransform deploys a wasm transform to a cluster.
	DeployWasmTransform(ctx context.Context, t rpadmin.TransformMetadata, file io.Reader) error

	// ListWasmTransforms lists the transforms that are running on a cluster.
	ListWasmTransforms(ctx context.Context) ([]rpadmin.TransformMetadata, error)

	// DeleteWasmTransform deletes a wasm transform in a cluster.
	DeleteWasmTransform(ctx context.Context, name string) error

	// Brokers queries one of the client's hosts and returns the list of brokers.
	Brokers(ctx context.Context) ([]rpadmin.Broker, error)

	// GetPartitionStatus gets the cluster partition status.
	GetPartitionStatus(ctx context.Context) (rpadmin.PartitionBalancerStatus, error)

	// Role returns the specific role in Redpanda.
	Role(ctx context.Context, roleName string) (rpadmin.RoleDetailResponse, error)

	// Roles returns the roles in Redpanda, use 'prefix', 'principal', and
	// 'principalType' to filter the results. principalType must be set along with
	// principal. It has no effect on its own.
	Roles(ctx context.Context, prefix, principal, principalType string) (rpadmin.RolesResponse, error)

	// CreateRole creates a Role in Redpanda with the given name.
	CreateRole(ctx context.Context, name string) (rpadmin.CreateRole, error)

	// RoleMembers returns the list of RoleMembers of a given role.
	RoleMembers(ctx context.Context, roleName string) (rpadmin.RoleMemberResponse, error)

	// UpdateRoleMembership updates the role membership for 'roleName' adding and
	// removing the passed members.
	UpdateRoleMembership(ctx context.Context, roleName string, add, remove []rpadmin.RoleMember, createRole bool) (rpadmin.PatchRoleResponse, error)

	// DeleteRole deletes a Role in Redpanda with the given name. If deleteACL is
	// true, Redpanda will delete ACLs bound to the role.
	DeleteRole(ctx context.Context, name string, deleteACL bool) error

	// GetDebugBundleStatus gets the current debug bundle process status on the specified broker node.
	// This should be called using Host client to issue a request against a specific broker node.
	GetDebugBundleStatus(ctx context.Context) (rpadmin.DebugBundleStatus, error)

	// MountTopics mounts topics according to the provided configuration.
	MountTopics(ctx context.Context, config rpadmin.MountConfiguration) (rpadmin.MigrationInfo, error)

	// UnmountTopics unmounts the provided list of topics.
	UnmountTopics(ctx context.Context, config rpadmin.UnmountConfiguration) (rpadmin.MigrationInfo, error)

	// ListMountableTopics retrieves a list of topics that can be mounted from cloud storage
	ListMountableTopics(ctx context.Context) (rpadmin.ListMountableTopicsResponse, error)

	// ListMigrations returns a list of all migrations in the cluster.
	ListMigrations(ctx context.Context) ([]rpadmin.MigrationState, error)

	// GetMigration gets a migration by its ID.
	GetMigration(ctx context.Context, id int) (rpadmin.MigrationState, error)

	// DeleteMigration deletes a migration by its ID.
	DeleteMigration(ctx context.Context, id int) error

	// ExecuteMigration executes a specific action on a migration identified by its ID.
	// We set all migrations to auto_advance = true so there's generally no reason to call this.
	ExecuteMigration(ctx context.Context, id int, action rpadmin.MigrationAction) error

	// GetHealthOverview gets the cluster health overview.
	GetHealthOverview(ctx context.Context) (rpadmin.ClusterHealthOverview, error)

	// BrokerIDToURL resolves the URL of the broker with the given ID.
	BrokerIDToURL(ctx context.Context, brokerID int) (string, error)

	// GetLicenseInfo gets the license info.
	GetLicenseInfo(ctx context.Context) (rpadmin.License, error)

	// SetLicense sets the base 64 encoding of the license.
	SetLicense(ctx context.Context, license io.Reader) error

	// GetEnterpriseFeatures reports enterprise features in use as well as the license status.
	GetEnterpriseFeatures(ctx context.Context) (rpadmin.EnterpriseFeaturesResponse, error)
}
