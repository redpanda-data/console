// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package integration

import (
	"context"
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/carlmjohnson/requests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	v1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

// userServiceClientV1 returns a v1 UserService connect-go client.
func (s *APISuite) userServiceClientV1() v1connect.UserServiceClient {
	return v1connect.NewUserServiceClient(http.DefaultClient, s.httpAddress())
}

func (s *APISuite) TestCreateUser_v1() {
	t := s.T()

	t.Run("create user with SCRAM-SHA-256 (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		defer cancel()

		client := s.userServiceClientV1()
		username := "console-integration-test-create-user-256"

		res, err := client.CreateUser(ctx, connect.NewRequest(&v1.CreateUserRequest{
			User: &v1.CreateUserRequest_User{
				Name:      username,
				Password:  "test-password",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
			},
		}))
		require.NoError(err)
		assert.Equal(username, res.Msg.User.Name)
		assert.Equal(v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256, *res.Msg.User.Mechanism)

		// Cleanup
		_, err = client.DeleteUser(ctx, connect.NewRequest(&v1.DeleteUserRequest{Name: username}))
		assert.NoError(err)
	})

	t.Run("create user with SCRAM-SHA-512 (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		defer cancel()

		client := s.userServiceClientV1()
		username := "console-integration-test-create-user-512"

		res, err := client.CreateUser(ctx, connect.NewRequest(&v1.CreateUserRequest{
			User: &v1.CreateUserRequest_User{
				Name:      username,
				Password:  "test-password",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512,
			},
		}))
		require.NoError(err)
		assert.Equal(username, res.Msg.User.Name)
		assert.Equal(v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512, *res.Msg.User.Mechanism)

		// Verify mechanism is returned in list
		listRes, err := client.ListUsers(ctx, connect.NewRequest(&v1.ListUsersRequest{
			Filter: &v1.ListUsersRequest_Filter{Name: username},
		}))
		require.NoError(err)
		require.Len(listRes.Msg.Users, 1)
		require.NotNil(listRes.Msg.Users[0].Mechanism)
		assert.Equal(v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512, *listRes.Msg.Users[0].Mechanism)

		// Cleanup
		_, err = client.DeleteUser(ctx, connect.NewRequest(&v1.DeleteUserRequest{Name: username}))
		assert.NoError(err)
	})
}

func (s *APISuite) TestListUsers_v1() {
	t := s.T()

	t.Run("list users with valid request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 12*time.Second)
		defer cancel()

		client := s.userServiceClientV1()

		username1 := "console-integration-test-list-users-1"
		username2 := "console-integration-test-list-users-2"
		for _, name := range []string{username1, username2} {
			_, err := client.CreateUser(ctx, connect.NewRequest(&v1.CreateUserRequest{
				User: &v1.CreateUserRequest_User{
					Name:      name,
					Password:  "test-password",
					Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
				},
			}))
			require.NoError(err)
		}
		defer func() {
			for _, name := range []string{username1, username2} {
				_, _ = client.DeleteUser(ctx, connect.NewRequest(&v1.DeleteUserRequest{Name: name}))
			}
		}()

		// List users
		res, err := client.ListUsers(ctx, connect.NewRequest(&v1.ListUsersRequest{}))
		require.NoError(err)
		assert.GreaterOrEqual(len(res.Msg.Users), 2)

		foundUser1 := false
		foundUser2 := false
		for _, user := range res.Msg.Users {
			if user.Name == username1 {
				foundUser1 = true
			}
			if user.Name == username2 {
				foundUser2 = true
			}
		}
		assert.Truef(foundUser1, "expected to find previously created user1 in list users response")
		assert.Truef(foundUser2, "expected to find previously created user2 in list users response")
	})

	t.Run("list users with valid request (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 12*time.Second)
		defer cancel()

		client := s.userServiceClientV1()

		username1 := "console-integration-test-list-users-http-1"
		username2 := "console-integration-test-list-users-http-2"
		for _, name := range []string{username1, username2} {
			_, err := client.CreateUser(ctx, connect.NewRequest(&v1.CreateUserRequest{
				User: &v1.CreateUserRequest_User{
					Name:      name,
					Password:  "test-password",
					Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
				},
			}))
			require.NoError(err)
		}
		defer func() {
			for _, name := range []string{username1, username2} {
				_, _ = client.DeleteUser(ctx, connect.NewRequest(&v1.DeleteUserRequest{Name: name}))
			}
		}()

		// List users via HTTP
		type listUsersRes struct {
			Users []struct {
				Name string `json:"name"`
			} `json:"users"`
		}
		var httpRes listUsersRes
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1/users").
			ToJSON(&httpRes).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)

		foundUser1 := false
		foundUser2 := false
		for _, user := range httpRes.Users {
			if user.Name == username1 {
				foundUser1 = true
			}
			if user.Name == username2 {
				foundUser2 = true
			}
		}
		assert.Truef(foundUser1, "expected to find previously created user1 in list users response")
		assert.Truef(foundUser2, "expected to find previously created user2 in list users response")
	})

	t.Run("list users with valid filter (connect-go)", func(t *testing.T) {
		require := require.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 20*time.Second)
		defer cancel()

		client := s.userServiceClientV1()

		users := []string{
			"console-integration-test-list-users-filter-1",
			"console-integration-test-list-users-filter-2",
			"console-integration-test-list-users-filter-3",
			"console-integration-test-list-users-filter-4",
			"console-integration-test-different-name-1",
		}
		for _, name := range users {
			_, err := client.CreateUser(ctx, connect.NewRequest(&v1.CreateUserRequest{
				User: &v1.CreateUserRequest_User{
					Name:      name,
					Password:  "test-password",
					Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
				},
			}))
			require.NoError(err)
		}
		defer func() {
			for _, name := range users {
				_, _ = client.DeleteUser(ctx, connect.NewRequest(&v1.DeleteUserRequest{Name: name}))
			}
		}()

		// Filter by name contains: should yield exactly one user
		res, err := client.ListUsers(ctx, connect.NewRequest(&v1.ListUsersRequest{
			Filter: &v1.ListUsersRequest_Filter{NameContains: "different-name"},
		}))
		require.NoError(err)
		require.Equal(1, len(res.Msg.Users))
		require.Equal("console-integration-test-different-name-1", res.Msg.Users[0].Name)

		// Filter by name contains: should yield exactly 4 users
		res, err = client.ListUsers(ctx, connect.NewRequest(&v1.ListUsersRequest{
			Filter: &v1.ListUsersRequest_Filter{NameContains: "list-users-filter"},
		}))
		require.NoError(err)
		require.Equal(4, len(res.Msg.Users))

		// Filter by exact name match
		res, err = client.ListUsers(ctx, connect.NewRequest(&v1.ListUsersRequest{
			Filter: &v1.ListUsersRequest_Filter{Name: "console-integration-test-list-users-filter-3"},
		}))
		require.NoError(err)
		require.Equal(1, len(res.Msg.Users))
		require.Equal("console-integration-test-list-users-filter-3", res.Msg.Users[0].Name)
	})
}

func (s *APISuite) TestUpdateUser_v1() {
	t := s.T()

	t.Run("update user password (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		defer cancel()

		client := s.userServiceClientV1()
		username := "console-integration-test-update-user"

		// Create user
		_, err := client.CreateUser(ctx, connect.NewRequest(&v1.CreateUserRequest{
			User: &v1.CreateUserRequest_User{
				Name:      username,
				Password:  "old-password",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
			},
		}))
		require.NoError(err)
		defer func() {
			_, _ = client.DeleteUser(ctx, connect.NewRequest(&v1.DeleteUserRequest{Name: username}))
		}()

		// Update password
		res, err := client.UpdateUser(ctx, connect.NewRequest(&v1.UpdateUserRequest{
			User: &v1.UpdateUserRequest_User{
				Name:      username,
				Password:  "new-password",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
			},
		}))
		require.NoError(err)
		assert.Equal(username, res.Msg.User.Name)
		assert.Equal(v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256, *res.Msg.User.Mechanism)
	})

	t.Run("update user mechanism (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		defer cancel()

		client := s.userServiceClientV1()
		username := "console-integration-test-update-mechanism"

		// Create with SHA-256
		_, err := client.CreateUser(ctx, connect.NewRequest(&v1.CreateUserRequest{
			User: &v1.CreateUserRequest_User{
				Name:      username,
				Password:  "test-password",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
			},
		}))
		require.NoError(err)
		defer func() {
			_, _ = client.DeleteUser(ctx, connect.NewRequest(&v1.DeleteUserRequest{Name: username}))
		}()

		// Update to SHA-512
		_, err = client.UpdateUser(ctx, connect.NewRequest(&v1.UpdateUserRequest{
			User: &v1.UpdateUserRequest_User{
				Name:      username,
				Password:  "test-password",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512,
			},
		}))
		require.NoError(err)

		// Verify mechanism changed in list
		listRes, err := client.ListUsers(ctx, connect.NewRequest(&v1.ListUsersRequest{
			Filter: &v1.ListUsersRequest_Filter{Name: username},
		}))
		require.NoError(err)
		require.Len(listRes.Msg.Users, 1)
		require.NotNil(listRes.Msg.Users[0].Mechanism)
		assert.Equal(v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512, *listRes.Msg.Users[0].Mechanism)
	})
}

func (s *APISuite) TestDeleteUser_v1() {
	t := s.T()

	t.Run("delete existing user (connect-go)", func(t *testing.T) {
		require := require.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		defer cancel()

		client := s.userServiceClientV1()
		username := "console-integration-test-delete-user"

		// Create user
		_, err := client.CreateUser(ctx, connect.NewRequest(&v1.CreateUserRequest{
			User: &v1.CreateUserRequest_User{
				Name:      username,
				Password:  "test-password",
				Mechanism: v1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
			},
		}))
		require.NoError(err)

		// Delete user
		_, err = client.DeleteUser(ctx, connect.NewRequest(&v1.DeleteUserRequest{Name: username}))
		require.NoError(err)

		// Verify user is gone
		listRes, err := client.ListUsers(ctx, connect.NewRequest(&v1.ListUsersRequest{
			Filter: &v1.ListUsersRequest_Filter{Name: username},
		}))
		require.NoError(err)
		require.Empty(listRes.Msg.Users)
	})

	t.Run("delete non-existent user returns not found (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		defer cancel()

		client := s.userServiceClientV1()

		_, err := client.DeleteUser(ctx, connect.NewRequest(&v1.DeleteUserRequest{
			Name: "console-integration-test-nonexistent-user",
		}))
		require.Error(err)

		var connectErr *connect.Error
		require.ErrorAs(err, &connectErr)
		assert.Equal(connect.CodeNotFound, connectErr.Code())
	})
}
