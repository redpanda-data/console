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
	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
)

func (s *APISuite) TestListUsers() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("list users with valid request (connect-go)", func(t *testing.T) {
		// 1. Create some users in Redpanda
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// Helper function to create a user
		createUser := func(username string) {
			childCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()

			err := s.redpandaAdminClient.CreateUser(childCtx, username, "random", adminapi.ScramSha256)
			require.NoError(err)
		}
		deleteUser := func(username string) {
			childCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()

			err := s.redpandaAdminClient.DeleteUser(childCtx, username)
			assert.NoError(err)
		}

		username1 := "console-integration-test-list-users-1"
		username2 := "console-integration-test-list-users-2"
		createUser(username1)
		createUser(username2)
		defer deleteUser(username1)
		defer deleteUser(username2)

		// 2. List users
		client := v1alpha1connect.NewUserServiceClient(http.DefaultClient, s.httpAddress())
		res, err := client.ListUsers(ctx, connect.NewRequest(&v1alpha1.ListUsersRequest{}))
		require.NoError(err)
		assert.GreaterOrEqual(2, len(res.Msg.Users))

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
		// 1. Create some users in Redpanda
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// Helper function to create a user
		createUser := func(username string) {
			childCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()

			err := s.redpandaAdminClient.CreateUser(childCtx, username, "random", adminapi.ScramSha256)
			require.NoError(err)
		}
		deleteUser := func(username string) {
			childCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()

			err := s.redpandaAdminClient.DeleteUser(childCtx, username)
			assert.NoError(err)
		}

		username1 := "console-integration-test-list-users-1"
		username2 := "console-integration-test-list-users-2"
		createUser(username1)
		createUser(username2)
		defer deleteUser(username1)
		defer deleteUser(username2)

		// 2. List users
		type listUsersRes struct {
			Users []struct {
				Name string `json:"name"`
			} `json:"users"`
		}
		var httpRes listUsersRes
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1alpha1/users").
			ToJSON(&httpRes).
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK), // Allows 2xx otherwise
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
		// 1. Create some users in Redpanda
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		// Helper function to create a user
		createUser := func(username string) {
			childCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()

			err := s.redpandaAdminClient.CreateUser(childCtx, username, "random", adminapi.ScramSha256)
			require.NoError(err)
		}
		deleteUser := func(username string) {
			childCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()

			err := s.redpandaAdminClient.DeleteUser(childCtx, username)
			assert.NoError(err)
		}

		users := []string{
			"console-integration-test-list-users-1",
			"console-integration-test-list-users-2",
			"console-integration-test-list-users-3",
			"console-integration-test-list-users-4",
			"console-integration-test-different-name-1",
		}
		for _, user := range users {
			createUser(user)
		}
		defer func() {
			for _, user := range users {
				deleteUser(user)
			}
		}()

		// 2. List users with name contains that should yield exactly one user
		client := v1alpha1connect.NewUserServiceClient(http.DefaultClient, s.httpAddress())
		res, err := client.ListUsers(ctx, connect.NewRequest(&v1alpha1.ListUsersRequest{
			Filter: &v1alpha1.ListUsersRequest_Filter{
				NameContains: "different-name",
			},
		}))
		require.NoError(err)
		require.Equal(1, len(res.Msg.Users))

		foundUser := res.Msg.Users[0]
		assert.Equal("console-integration-test-different-name-1", foundUser.Name)

		// 3. List users with name contains that should yield exactly 4 users
		res, err = client.ListUsers(ctx, connect.NewRequest(&v1alpha1.ListUsersRequest{
			Filter: &v1alpha1.ListUsersRequest_Filter{
				NameContains: "test-list-users",
			},
		}))
		require.NoError(err)
		require.Equal(4, len(res.Msg.Users))

		// 3. List users with exact name match that should yield one user
		res, err = client.ListUsers(ctx, connect.NewRequest(&v1alpha1.ListUsersRequest{
			Filter: &v1alpha1.ListUsersRequest_Filter{
				Name: "console-integration-test-list-users-3",
			},
		}))
		require.NoError(err)
		require.Equal(1, len(res.Msg.Users))
		require.Equal("console-integration-test-list-users-3", res.Msg.Users[0].Name)
	})
}
