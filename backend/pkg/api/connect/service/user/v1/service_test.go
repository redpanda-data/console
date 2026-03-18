// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package user

import (
	"context"
	"log/slog"
	"os"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/console"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

// testServicer implements console.Servicer by embedding the interface (so all
// methods compile) and overriding only the SCRAM methods with real kadm calls.
// Any non-SCRAM method will panic at runtime, which is fine for these tests.
type testServicer struct {
	console.Servicer
	admCl *kadm.Client
}

func (t *testServicer) DescribeUserSCRAMCredentials(ctx context.Context, users ...string) (kadm.DescribedUserSCRAMs, error) {
	return t.admCl.DescribeUserSCRAMs(ctx, users...)
}

func (t *testServicer) AlterUserSCRAMs(ctx context.Context, del []kadm.DeleteSCRAM, upsert []kadm.UpsertSCRAM) (kadm.AlteredUserSCRAMs, error) {
	return t.admCl.AlterUserSCRAMs(ctx, del, upsert)
}

// testEnv holds the shared test fixtures created by setupTest.
type testEnv struct {
	cluster *kfake.Cluster
	admCl   *kadm.Client
	svc     *Service
}

// setupTest creates a kfake cluster, kadm client, and user.Service for testing.
func setupTest(t *testing.T) testEnv {
	t.Helper()

	cluster, err := kfake.NewCluster(kfake.NumBrokers(1))
	require.NoError(t, err)
	t.Cleanup(cluster.Close)

	// testutil.CreateClients caps at Kafka 2.6.0, but SCRAM APIs need 2.7.0+.
	cl, err := kgo.NewClient(kgo.SeedBrokers(cluster.ListenAddrs()...))
	require.NoError(t, err)
	t.Cleanup(cl.Close)

	admCl := kadm.NewClient(cl)

	svc := NewService(
		slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn})),
		&testServicer{admCl: admCl},
	)

	return testEnv{cluster: cluster, admCl: admCl, svc: svc}
}

// seedUser creates a SCRAM user directly via kadm for test setup.
func (e testEnv) seedUser(t *testing.T, name, password string, mechanism kadm.ScramMechanism) {
	t.Helper()

	results, err := e.admCl.AlterUserSCRAMs(t.Context(), nil, []kadm.UpsertSCRAM{{
		User:       name,
		Mechanism:  mechanism,
		Iterations: console.DefaultSCRAMIterations,
		Password:   password,
	}})
	require.NoError(t, err)
	require.True(t, results.Ok())
}

func TestListUsers(t *testing.T) {
	t.Run("returns empty list when no users exist", func(t *testing.T) {
		env := setupTest(t)

		resp, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{}))
		require.NoError(t, err)
		assert.Empty(t, resp.Msg.Users)
	})

	t.Run("returns users with mechanism info", func(t *testing.T) {
		env := setupTest(t)

		env.seedUser(t, "alice", "pass1", kadm.ScramSha256)
		env.seedUser(t, "bob", "pass2", kadm.ScramSha512)

		resp, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{}))
		require.NoError(t, err)
		require.Len(t, resp.Msg.Users, 2)

		// Sorted alphabetically
		assert.Equal(t, "alice", resp.Msg.Users[0].Name)
		assert.Equal(t, v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256, *resp.Msg.Users[0].Mechanism)
		assert.Equal(t, "bob", resp.Msg.Users[1].Name)
		assert.Equal(t, v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512, *resp.Msg.Users[1].Mechanism)
	})

	t.Run("filters by exact name", func(t *testing.T) {
		env := setupTest(t)

		env.seedUser(t, "alice", "pass1", kadm.ScramSha256)
		env.seedUser(t, "bob", "pass2", kadm.ScramSha256)

		resp, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{
			Filter: &v1.ListUsersRequest_Filter{Name: "alice"},
		}))
		require.NoError(t, err)
		require.Len(t, resp.Msg.Users, 1)
		assert.Equal(t, "alice", resp.Msg.Users[0].Name)
	})

	t.Run("filters by name contains", func(t *testing.T) {
		env := setupTest(t)

		env.seedUser(t, "alice-admin", "pass1", kadm.ScramSha256)
		env.seedUser(t, "bob-admin", "pass2", kadm.ScramSha256)
		env.seedUser(t, "carol", "pass3", kadm.ScramSha256)

		resp, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{
			Filter: &v1.ListUsersRequest_Filter{NameContains: "admin"},
		}))
		require.NoError(t, err)
		require.Len(t, resp.Msg.Users, 2)
		assert.Equal(t, "alice-admin", resp.Msg.Users[0].Name)
		assert.Equal(t, "bob-admin", resp.Msg.Users[1].Name)
	})

	t.Run("paginates results", func(t *testing.T) {
		env := setupTest(t)

		env.seedUser(t, "user-a", "pass", kadm.ScramSha256)
		env.seedUser(t, "user-b", "pass", kadm.ScramSha256)
		env.seedUser(t, "user-c", "pass", kadm.ScramSha256)

		// First page
		resp, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{
			PageSize: 2,
		}))
		require.NoError(t, err)
		require.Len(t, resp.Msg.Users, 2)
		assert.NotEmpty(t, resp.Msg.NextPageToken)

		// Second page
		resp2, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{
			PageSize:  2,
			PageToken: resp.Msg.NextPageToken,
		}))
		require.NoError(t, err)
		require.Len(t, resp2.Msg.Users, 1)
		assert.Empty(t, resp2.Msg.NextPageToken)
	})

	t.Run("returns error on transport failure", func(t *testing.T) {
		env := setupTest(t)

		env.cluster.ControlKey(int16(kmsg.DescribeUserSCRAMCredentials), func(kmsg.Request) (kmsg.Response, error, bool) {
			return nil, kerr.ClusterAuthorizationFailed, true
		})

		_, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{}))
		require.Error(t, err)

		var connectErr *connect.Error
		require.ErrorAs(t, err, &connectErr)
		// Transport errors (connection closed) map to CodeInternal
		assert.Equal(t, connect.CodeInternal, connectErr.Code())
	})
}

func TestCreateUser(t *testing.T) {
	t.Run("creates user with SCRAM-SHA-256", func(t *testing.T) {
		env := setupTest(t)

		resp, err := env.svc.CreateUser(t.Context(), connect.NewRequest(&v1.CreateUserRequest{
			User: &v1.CreateUserRequest_User{
				Name:      "newuser",
				Password:  "secret123",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
			},
		}))
		require.NoError(t, err)
		assert.Equal(t, "newuser", resp.Msg.User.Name)
		assert.Equal(t, v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256, *resp.Msg.User.Mechanism)

		// Verify user exists via list
		listResp, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{}))
		require.NoError(t, err)
		require.Len(t, listResp.Msg.Users, 1)
		assert.Equal(t, "newuser", listResp.Msg.Users[0].Name)
	})

	t.Run("creates user with SCRAM-SHA-512", func(t *testing.T) {
		env := setupTest(t)

		resp, err := env.svc.CreateUser(t.Context(), connect.NewRequest(&v1.CreateUserRequest{
			User: &v1.CreateUserRequest_User{
				Name:      "newuser",
				Password:  "secret123",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512,
			},
		}))
		require.NoError(t, err)
		assert.Equal(t, v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512, *resp.Msg.User.Mechanism)
	})

	t.Run("returns error for invalid mechanism", func(t *testing.T) {
		env := setupTest(t)

		_, err := env.svc.CreateUser(t.Context(), connect.NewRequest(&v1.CreateUserRequest{
			User: &v1.CreateUserRequest_User{
				Name:      "newuser",
				Password:  "secret123",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_UNSPECIFIED,
			},
		}))
		require.Error(t, err)

		var connectErr *connect.Error
		require.ErrorAs(t, err, &connectErr)
		assert.Equal(t, connect.CodeInternal, connectErr.Code())
	})

	t.Run("returns per-user error from broker", func(t *testing.T) {
		env := setupTest(t)

		env.cluster.ControlKey(int16(kmsg.AlterUserSCRAMCredentials), func(req kmsg.Request) (kmsg.Response, error, bool) {
			r, ok := req.(*kmsg.AlterUserSCRAMCredentialsRequest)
			require.True(t, ok)
			resp, ok := r.ResponseKind().(*kmsg.AlterUserSCRAMCredentialsResponse)
			require.True(t, ok)
			for _, u := range r.Upsertions {
				resp.Results = append(resp.Results, kmsg.AlterUserSCRAMCredentialsResponseResult{
					User:         u.Name,
					ErrorCode:    kerr.ClusterAuthorizationFailed.Code,
					ErrorMessage: new("not authorized"),
				})
			}
			return resp, nil, true
		})

		_, err := env.svc.CreateUser(t.Context(), connect.NewRequest(&v1.CreateUserRequest{
			User: &v1.CreateUserRequest_User{
				Name:      "newuser",
				Password:  "secret123",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
			},
		}))
		require.Error(t, err)

		var connectErr *connect.Error
		require.ErrorAs(t, err, &connectErr)
		assert.Equal(t, connect.CodePermissionDenied, connectErr.Code())
	})
}

func TestUpdateUser(t *testing.T) {
	t.Run("updates existing user password", func(t *testing.T) {
		env := setupTest(t)

		env.seedUser(t, "existing", "oldpass", kadm.ScramSha256)

		resp, err := env.svc.UpdateUser(t.Context(), connect.NewRequest(&v1.UpdateUserRequest{
			User: &v1.UpdateUserRequest_User{
				Name:      "existing",
				Password:  "newpass",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
			},
		}))
		require.NoError(t, err)
		assert.Equal(t, "existing", resp.Msg.User.Name)
	})

	t.Run("upserts non-existing user", func(t *testing.T) {
		env := setupTest(t)

		resp, err := env.svc.UpdateUser(t.Context(), connect.NewRequest(&v1.UpdateUserRequest{
			User: &v1.UpdateUserRequest_User{
				Name:      "brandnew",
				Password:  "pass",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
			},
		}))
		require.NoError(t, err)
		assert.Equal(t, "brandnew", resp.Msg.User.Name)

		// Verify it was created
		listResp, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{}))
		require.NoError(t, err)
		require.Len(t, listResp.Msg.Users, 1)
	})
}

func TestDeleteUser(t *testing.T) {
	t.Run("deletes existing user", func(t *testing.T) {
		env := setupTest(t)

		env.seedUser(t, "todelete", "pass", kadm.ScramSha256)

		resp, err := env.svc.DeleteUser(t.Context(), connect.NewRequest(&v1.DeleteUserRequest{
			Name: "todelete",
		}))
		require.NoError(t, err)
		assert.Equal(t, "204", resp.Header().Get("x-http-code"))

		// Verify user is gone
		listResp, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{}))
		require.NoError(t, err)
		assert.Empty(t, listResp.Msg.Users)
	})

	t.Run("deletes user with multiple mechanisms", func(t *testing.T) {
		env := setupTest(t)

		env.seedUser(t, "multimech", "pass", kadm.ScramSha256)
		env.seedUser(t, "multimech", "pass", kadm.ScramSha512)

		_, err := env.svc.DeleteUser(t.Context(), connect.NewRequest(&v1.DeleteUserRequest{
			Name: "multimech",
		}))
		require.NoError(t, err)

		// Verify user is gone
		listResp, err := env.svc.ListUsers(t.Context(), connect.NewRequest(&v1.ListUsersRequest{}))
		require.NoError(t, err)
		assert.Empty(t, listResp.Msg.Users)
	})

	t.Run("returns not found for non-existent user", func(t *testing.T) {
		env := setupTest(t)

		_, err := env.svc.DeleteUser(t.Context(), connect.NewRequest(&v1.DeleteUserRequest{
			Name: "nonexistent",
		}))
		require.Error(t, err)

		var connectErr *connect.Error
		require.ErrorAs(t, err, &connectErr)
		assert.Equal(t, connect.CodeNotFound, connectErr.Code())
	})

	t.Run("returns error on describe transport failure", func(t *testing.T) {
		env := setupTest(t)

		env.cluster.ControlKey(int16(kmsg.DescribeUserSCRAMCredentials), func(kmsg.Request) (kmsg.Response, error, bool) {
			return nil, kerr.ClusterAuthorizationFailed, true
		})

		_, err := env.svc.DeleteUser(t.Context(), connect.NewRequest(&v1.DeleteUserRequest{
			Name: "anyuser",
		}))
		require.Error(t, err)

		var connectErr *connect.Error
		require.ErrorAs(t, err, &connectErr)
		// Transport error maps to CodeInternal
		assert.Equal(t, connect.CodeInternal, connectErr.Code())
	})

	t.Run("returns per-user error on describe", func(t *testing.T) {
		env := setupTest(t)

		env.cluster.ControlKey(int16(kmsg.DescribeUserSCRAMCredentials), func(req kmsg.Request) (kmsg.Response, error, bool) {
			r, ok := req.(*kmsg.DescribeUserSCRAMCredentialsRequest)
			require.True(t, ok)
			resp, ok := r.ResponseKind().(*kmsg.DescribeUserSCRAMCredentialsResponse)
			require.True(t, ok)
			for _, u := range r.Users {
				resp.Results = append(resp.Results, kmsg.DescribeUserSCRAMCredentialsResponseResult{
					User:      u.Name,
					ErrorCode: kerr.ClusterAuthorizationFailed.Code,
				})
			}
			return resp, nil, true
		})

		_, err := env.svc.DeleteUser(t.Context(), connect.NewRequest(&v1.DeleteUserRequest{
			Name: "anyuser",
		}))
		require.Error(t, err)

		var connectErr *connect.Error
		require.ErrorAs(t, err, &connectErr)
		assert.Equal(t, connect.CodePermissionDenied, connectErr.Code())
	})

	t.Run("returns error on alter failure after successful describe", func(t *testing.T) {
		env := setupTest(t)

		env.seedUser(t, "victim", "pass", kadm.ScramSha256)

		env.cluster.ControlKey(int16(kmsg.AlterUserSCRAMCredentials), func(req kmsg.Request) (kmsg.Response, error, bool) {
			r, ok := req.(*kmsg.AlterUserSCRAMCredentialsRequest)
			require.True(t, ok)
			resp, ok := r.ResponseKind().(*kmsg.AlterUserSCRAMCredentialsResponse)
			require.True(t, ok)
			for _, d := range r.Deletions {
				resp.Results = append(resp.Results, kmsg.AlterUserSCRAMCredentialsResponseResult{
					User:      d.Name,
					ErrorCode: kerr.ClusterAuthorizationFailed.Code,
				})
			}
			return resp, nil, true
		})

		_, err := env.svc.DeleteUser(t.Context(), connect.NewRequest(&v1.DeleteUserRequest{
			Name: "victim",
		}))
		require.Error(t, err)

		var connectErr *connect.Error
		require.ErrorAs(t, err, &connectErr)
		assert.Equal(t, connect.CodePermissionDenied, connectErr.Code())
	})
}
