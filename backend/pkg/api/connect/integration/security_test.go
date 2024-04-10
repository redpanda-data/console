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
	"sort"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/redpanda-data/common-go/adminapi"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

func (s *APISuite) TestListRoles() {
	t := s.T()

	client := v1alpha1connect.NewSecurityServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("list roles with valid request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		require := require.New(t)

		res, err := client.ListRoles(ctx, connect.NewRequest(&v1alpha1.ListRolesRequest{}))
		require.NoError(err)
		require.Equal(0, len(res.Msg.GetRoles()))
	})

	t.Run("list roles with filter (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		// 1. Create some role and principals in Redpanda
		ctxCreate, cancelCreate := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancelCreate()
		_, err := s.redpandaAdminClient.UpdateRoleMembership(ctxCreate, "list_role_test_connect",
			[]adminapi.RoleMember{{
				PrincipalType: "User",
				Name:          "foo0",
			}, {
				PrincipalType: "User",
				Name:          "bar0",
			}}, nil, true)
		require.NoError(err)

		_, err = s.redpandaAdminClient.UpdateRoleMembership(ctxCreate, "list_role_test_connect_2",
			[]adminapi.RoleMember{{
				PrincipalType: "User",
				Name:          "zig0",
			}, {
				PrincipalType: "User",
				Name:          "zag0",
			}}, nil, true)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
			defer cancel()

			err = s.redpandaAdminClient.DeleteRole(ctx, "list_role_test_connect", true)
			assert.NoError(err)
			assert.NoError(err)

			err = s.redpandaAdminClient.DeleteRole(ctx, "list_role_test_connect_2", true)
			assert.NoError(err)
		}()

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		// 2. Test
		res, err := client.ListRoles(ctx, connect.NewRequest(&v1alpha1.ListRolesRequest{}))
		require.NoError(err)
		roles := res.Msg.GetRoles()
		require.Equal(2, len(roles))

		sort.Slice(roles, func(i, j int) bool {
			return roles[i].GetName() < roles[j].GetName()
		})

		assert.Equal("list_role_test_connect", roles[0].GetName())
		assert.Equal("list_role_test_connect_2", roles[1].GetName())

		res, err = client.ListRoles(ctx, connect.NewRequest(&v1alpha1.ListRolesRequest{
			Filter: &v1alpha1.ListRolesRequest_Filter{NameContains: "role_test"},
		}))
		require.NoError(err)
		roles = res.Msg.GetRoles()
		sort.Slice(roles, func(i, j int) bool {
			return roles[i].GetName() < roles[j].GetName()
		})
		require.Equal(2, len(roles))
		assert.Equal("list_role_test_connect", roles[0].GetName())
		assert.Equal("list_role_test_connect_2", roles[1].GetName())

		res, err = client.ListRoles(ctx, connect.NewRequest(&v1alpha1.ListRolesRequest{
			Filter: &v1alpha1.ListRolesRequest_Filter{Principal: "User:zag0"},
		}))
		require.NoError(err)
		roles = res.Msg.GetRoles()
		require.Equal(1, len(roles))
		assert.Equal("list_role_test_connect_2", roles[0].GetName())

		res, err = client.ListRoles(ctx, connect.NewRequest(&v1alpha1.ListRolesRequest{
			Filter: &v1alpha1.ListRolesRequest_Filter{Principal: "User:unknown_user_1234"},
		}))
		require.NoError(err)
		roles = res.Msg.GetRoles()
		assert.Empty(roles)
	})
}

func (s *APISuite) TestGetRole() {
	t := s.T()

	client := v1alpha1connect.NewSecurityServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("get role with valid request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		// 1. Create some role and principals in Redpanda
		ctxCreate, cancelCreate := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancelCreate()
		_, err := s.redpandaAdminClient.UpdateRoleMembership(ctxCreate, "get_role_test_connect",
			[]adminapi.RoleMember{{
				PrincipalType: "User",
				Name:          "foo0",
			}, {
				PrincipalType: "User",
				Name:          "bar0",
			}}, nil, true)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
			defer cancel()

			err = s.redpandaAdminClient.DeleteRole(ctx, "get_role_test_connect", true)
			assert.NoError(err)
		}()

		// 2. Test
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		res, err := client.GetRole(ctx, connect.NewRequest(&v1alpha1.GetRoleRequest{RoleName: "get_role_test_connect"}))
		require.NoError(err)

		assert.Equal("get_role_test_connect", res.Msg.GetRole().GetName())
		members := res.Msg.GetMembers()
		assert.Len(members, 2)
		sort.Slice(members, func(i, j int) bool {
			return members[i].GetPrincipal() < members[j].GetPrincipal()
		})
		assert.Equal("User:bar0", members[0].GetPrincipal())
		assert.Equal("User:foo0", members[1].GetPrincipal())
	})

	t.Run("get role with unknown request (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		_, err := client.GetRole(ctx, connect.NewRequest(&v1alpha1.GetRoleRequest{RoleName: "some_unknown_role_1234"}))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound, connect.CodeOf(err))
	})
}

func (s *APISuite) TestCreateRole() {
	t := s.T()

	client := v1alpha1connect.NewSecurityServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("create role with valid request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		res, err := client.CreateRole(ctx, connect.NewRequest(&v1alpha1.CreateRoleRequest{
			Role: &v1alpha1.Role{Name: "new_role_test"},
		}))
		require.NoError(err)
		assert.Equal("new_role_test", res.Msg.GetRole().GetName())

		err = s.redpandaAdminClient.DeleteRole(ctx, "new_role_test", true)
		assert.NoError(err)
	})

	t.Run("create role with invalid request (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		_, err := client.CreateRole(ctx, connect.NewRequest(&v1alpha1.CreateRoleRequest{
			Role: &v1alpha1.Role{Name: ""},
		}))

		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	})
}

func (s *APISuite) TestListRoleMembers() {
	t := s.T()

	requireT := require.New(t)
	assertT := assert.New(t)

	// 1. Create some role and principals in Redpanda
	ctxCreate, cancelCreate := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancelCreate()
	_, err := s.redpandaAdminClient.UpdateRoleMembership(ctxCreate, "list_role_members_test_connect",
		[]adminapi.RoleMember{{
			PrincipalType: "User",
			Name:          "foo0",
		}, {
			PrincipalType: "User",
			Name:          "bar0",
		}}, nil, true)
	requireT.NoError(err)

	_, err = s.redpandaAdminClient.UpdateRoleMembership(ctxCreate, "list_role_members_test_connect_2",
		[]adminapi.RoleMember{{
			PrincipalType: "User",
			Name:          "zig0",
		}, {
			PrincipalType: "User",
			Name:          "zag0",
		}}, nil, true)
	requireT.NoError(err)

	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		err = s.redpandaAdminClient.DeleteRole(ctx, "list_role_members_test_connect", true)
		assertT.NoError(err)

		err = s.redpandaAdminClient.DeleteRole(ctx, "list_role_members_test_connect_2", true)
		assertT.NoError(err)
	}()

	client := v1alpha1connect.NewSecurityServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("list role members (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		res, err := client.ListRoleMembers(ctx, connect.NewRequest(&v1alpha1.ListRoleMembersRequest{
			RoleName: "list_role_members_test_connect",
		}))
		require.NoError(err)
		assert.Equal("list_role_members_test_connect", res.Msg.GetRoleName())
		members := res.Msg.GetMembers()
		sort.Slice(members, func(i, j int) bool {
			return members[i].GetPrincipal() < members[j].GetPrincipal()
		})
		require.Equal(2, len(members))
		assert.Equal("User:bar0", members[0].GetPrincipal())
		assert.Equal("User:foo0", members[1].GetPrincipal())

		res, err = client.ListRoleMembers(ctx, connect.NewRequest(&v1alpha1.ListRoleMembersRequest{
			RoleName: "list_role_members_test_connect_2",
		}))
		require.NoError(err)
		assert.Equal("list_role_members_test_connect_2", res.Msg.GetRoleName())
		members = res.Msg.GetMembers()
		sort.Slice(members, func(i, j int) bool {
			return members[i].GetPrincipal() < members[j].GetPrincipal()
		})
		require.Equal(2, len(members))
		assert.Equal("User:zag0", members[0].GetPrincipal())
		assert.Equal("User:zig0", members[1].GetPrincipal())
	})

	t.Run("list role members with filter (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		res, err := client.ListRoleMembers(ctx, connect.NewRequest(&v1alpha1.ListRoleMembersRequest{
			RoleName: "list_role_members_test_connect",
			Filter:   &v1alpha1.ListRoleMembersRequest_Filter{NameContains: "foo"},
		}))
		require.NoError(err)
		assert.Equal("list_role_members_test_connect", res.Msg.GetRoleName())
		members := res.Msg.GetMembers()
		require.Equal(1, len(members))
		assert.Equal("User:foo0", members[0].GetPrincipal())

		res, err = client.ListRoleMembers(ctx, connect.NewRequest(&v1alpha1.ListRoleMembersRequest{
			RoleName: "list_role_members_test_connect",
			Filter:   &v1alpha1.ListRoleMembersRequest_Filter{NameContains: "zig"},
		}))
		require.NoError(err)
		assert.Equal("list_role_members_test_connect", res.Msg.GetRoleName())
		members = res.Msg.GetMembers()
		require.Equal(0, len(members))
	})
}

func (s *APISuite) TestDeleteRole() {
	t := s.T()

	requireT := require.New(t)

	// 1. Create some role and principals in Redpanda
	ctxCreate, cancelCreate := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancelCreate()
	_, err := s.redpandaAdminClient.UpdateRoleMembership(ctxCreate, "delete_role_test_connect",
		[]adminapi.RoleMember{{
			PrincipalType: "User",
			Name:          "foo0",
		}, {
			PrincipalType: "User",
			Name:          "bar0",
		}}, nil, true)
	requireT.NoError(err)

	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		s.redpandaAdminClient.DeleteRole(ctx, "delete_role_test_connect", true)
	}()

	client := v1alpha1connect.NewSecurityServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("delete role with valid request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		_, err := client.DeleteRole(ctx, connect.NewRequest(&v1alpha1.DeleteRoleRequest{
			RoleName: "delete_role_test_connect",
		}))
		require.NoError(err)

		_, err = s.redpandaAdminClient.Role(ctx, "delete_role_test_connect")
		assert.Error(err)
		assert.Contains(err.Error(), "not found")
	})

	t.Run("delete role with unknown role (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		_, err := client.DeleteRole(ctx, connect.NewRequest(&v1alpha1.DeleteRoleRequest{
			RoleName: "delete_role_test_connect_unknown_123",
		}))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound, connect.CodeOf(err))
	})
}

func (s *APISuite) TestUpdateRoleMembership() {
	t := s.T()

	client := v1alpha1connect.NewSecurityServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("add with create (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		res, err := client.UpdateRoleMembership(ctx, connect.NewRequest(&v1alpha1.UpdateRoleMembershipRequest{
			RoleName: "update_role_test_connect",
			Create:   true,
			Add: []*v1alpha1.RoleMembership{
				{
					Principal: "User:foo0",
				},
				{
					Principal: "User:bar0",
				},
			},
		}))
		require.NoError(err)
		assert.Equal("update_role_test_connect", res.Msg.GetRoleName())
		assert.Len(res.Msg.GetAdded(), 2)

		roleRes, err := s.redpandaAdminClient.Role(ctx, "update_role_test_connect")
		assert.NoError(err)
		assert.Equal("update_role_test_connect", roleRes.RoleName)
		assert.Len(roleRes.Members, 2)

		s.redpandaAdminClient.DeleteRole(ctx, "update_role_test_connect", true)
	})

	t.Run("add with create on existing (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		_, err := s.redpandaAdminClient.CreateRole(ctx, "update_role_test_connect_existing")
		require.NoError(err)

		defer func() {
			s.redpandaAdminClient.DeleteRole(ctx, "update_role_test_connect_existing", true)
		}()

		res, err := client.UpdateRoleMembership(ctx, connect.NewRequest(&v1alpha1.UpdateRoleMembershipRequest{
			RoleName: "update_role_test_connect_existing",
			Create:   true,
			Add: []*v1alpha1.RoleMembership{
				{
					Principal: "User:zig0",
				},
			},
		}))
		require.NoError(err)
		assert.Equal("update_role_test_connect_existing", res.Msg.GetRoleName())
		assert.Len(res.Msg.GetAdded(), 1)

		roleRes, err := s.redpandaAdminClient.Role(ctx, "update_role_test_connect_existing")
		assert.NoError(err)
		assert.Equal("update_role_test_connect_existing", roleRes.RoleName)
		assert.Len(roleRes.Members, 1)
	})

	t.Run("add without create on unknown (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		_, err := client.UpdateRoleMembership(ctx, connect.NewRequest(&v1alpha1.UpdateRoleMembershipRequest{
			RoleName: "update_role_test_connect_unknown_123",
			Add: []*v1alpha1.RoleMembership{
				{
					Principal: "User:zig0",
				},
			},
		}))

		assert.Error(err)
		assert.Equal(connect.CodeNotFound, connect.CodeOf(err))
	})

	t.Run("add and remove (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		res, err := client.UpdateRoleMembership(ctx, connect.NewRequest(&v1alpha1.UpdateRoleMembershipRequest{
			RoleName: "update_role_test_add_remove_connect",
			Create:   true,
			Add: []*v1alpha1.RoleMembership{
				{
					Principal: "User:foo0",
				},
				{
					Principal: "User:bar0",
				},
			},
		}))
		require.NoError(err)
		assert.Equal("update_role_test_add_remove_connect", res.Msg.GetRoleName())
		assert.Len(res.Msg.GetAdded(), 2)

		defer func() {
			s.redpandaAdminClient.DeleteRole(ctx, "update_role_test_add_remove_connect", true)
		}()

		res, err = client.UpdateRoleMembership(ctx, connect.NewRequest(&v1alpha1.UpdateRoleMembershipRequest{
			RoleName: "update_role_test_add_remove_connect",
			Add: []*v1alpha1.RoleMembership{
				{
					Principal: "User:foo0",
				},
				{
					Principal: "User:zig0",
				},
				{
					Principal: "User:zag0",
				},
			},
			Remove: []*v1alpha1.RoleMembership{
				{
					Principal: "User:bar0",
				},
			},
		}))
		require.NoError(err)
		assert.Equal("update_role_test_add_remove_connect", res.Msg.GetRoleName())
		assert.Len(res.Msg.GetAdded(), 2)
		assert.Len(res.Msg.GetRemoved(), 1)

		roleRes, err := s.redpandaAdminClient.Role(ctx, "update_role_test_add_remove_connect")
		assert.NoError(err)
		assert.Equal("update_role_test_add_remove_connect", roleRes.RoleName)
		require.Len(roleRes.Members, 3)

		members := roleRes.Members
		sort.Slice(members, func(i, j int) bool {
			return members[i].Name < members[j].Name
		})
		assert.Equal("foo0", members[0].Name)
		assert.Equal("zag0", members[1].Name)
		assert.Equal("zig0", members[2].Name)
	})
}
