// Copyright 2023 Redpanda Data, Inc.
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
	"fmt"
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/carlmjohnson/requests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"

	"github.com/redpanda-data/console/backend/pkg/protocmp"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
)

func (s *APISuite) DeleteAllACLs(ctx context.Context) error {
	acls := kadm.NewACLs().
		Allow().
		ResourcePatternType(kadm.ACLPatternAny).
		Groups().
		Topics().
		TransactionalIDs().
		Clusters().
		Operations(kadm.OpAny)
	if err := acls.ValidateDelete(); err != nil {
		return fmt.Errorf("failed to validate delete acl request: %w", err)
	}

	_, err := s.kafkaAdminClient.DeleteACLs(ctx, acls)
	return err
}

func (s *APISuite) newStdACLResource(resourceType v1alpha1.ACL_ResourceType, resourceName string, principal string) *v1alpha1.ListACLsResponse_Resource {
	return &v1alpha1.ListACLsResponse_Resource{
		ResourceType:        resourceType,
		ResourceName:        resourceName,
		ResourcePatternType: v1alpha1.ACL_RESOURCE_PATTERN_TYPE_LITERAL,
		Acls: []*v1alpha1.ListACLsResponse_Policy{
			{
				Principal:      principal,
				Host:           "*",
				Operation:      v1alpha1.ACL_OPERATION_ALL,
				PermissionType: v1alpha1.ACL_PERMISSION_TYPE_ALLOW,
			},
		},
	}
}

func (s *APISuite) TestListACLs() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("list ACLs with default request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// 1. Seed some ACLs
		principal := "User:test"
		resourceNamePrefix := "console-test-"

		resourceNames := map[v1alpha1.ACL_ResourceType]string{
			v1alpha1.ACL_RESOURCE_TYPE_GROUP:            fmt.Sprintf("%vgroup", resourceNamePrefix),
			v1alpha1.ACL_RESOURCE_TYPE_TOPIC:            fmt.Sprintf("%vtopic", resourceNamePrefix),
			v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID: fmt.Sprintf("%vtransactional-id", resourceNamePrefix),
			v1alpha1.ACL_RESOURCE_TYPE_CLUSTER:          "kafka-cluster",
		}

		acls := kadm.NewACLs().
			Allow(principal).
			ResourcePatternType(kadm.ACLPatternLiteral).
			Groups(resourceNames[v1alpha1.ACL_RESOURCE_TYPE_GROUP]).
			Topics(resourceNames[v1alpha1.ACL_RESOURCE_TYPE_TOPIC]).
			TransactionalIDs(resourceNames[v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID]).
			Clusters().
			Operations(kadm.OpAll)

		err := acls.ValidateCreate()
		require.NoError(err)

		_, err = s.kafkaAdminClient.CreateACLs(ctx, acls)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.DeleteAllACLs(ctx)
			assert.NoError(err, "failed to delete all ACLs")
		}()

		// 2. List ACLs
		client := v1alpha1connect.NewACLServiceClient(http.DefaultClient, s.httpAddress())
		res, err := client.ListACLs(ctx, connect.NewRequest(&v1alpha1.ListACLsRequest{}))
		require.NoError(err)
		require.NotNil(res.Msg, "response message must not be nil")
		require.GreaterOrEqual(len(res.Msg.Resources), 4)

		// 3. From all ACLs returned by the Kafka API, filter only those that match
		// the patterns of the seeded ACLs. There may be existing system-internal ACLs,
		// see: https://github.com/redpanda-data/redpanda/issues/14373 .
		filteredResources := make([]*v1alpha1.ListACLsResponse_Resource, 0)
		for _, res := range res.Msg.Resources {
			// Check if resource name matches a seeded ACL resource name
			name, isMatch := resourceNames[res.ResourceType]
			if !isMatch || name != res.ResourceName {
				continue
			}

			// There should be no such case, but we want to fail loudly if it happens regardless.
			// Otherwise, it may be unnecessarily hard to debug why this test failed.
			require.Greater(len(res.Acls), 0, fmt.Sprintf("The ACLs list for a given resource group (name: %q, type: %q) is empty", res.ResourceName, res.ResourceType))

			if res.Acls[0].Principal != principal {
				continue
			}
			filteredResources = append(filteredResources, res)
		}

		// 4. Compare all filtered resources against expected ACLs
		expectedResources := map[v1alpha1.ACL_ResourceType]*v1alpha1.ListACLsResponse_Resource{
			v1alpha1.ACL_RESOURCE_TYPE_TOPIC:            s.newStdACLResource(v1alpha1.ACL_RESOURCE_TYPE_TOPIC, resourceNames[v1alpha1.ACL_RESOURCE_TYPE_TOPIC], principal),
			v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID: s.newStdACLResource(v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID, resourceNames[v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID], principal),
			v1alpha1.ACL_RESOURCE_TYPE_GROUP:            s.newStdACLResource(v1alpha1.ACL_RESOURCE_TYPE_GROUP, resourceNames[v1alpha1.ACL_RESOURCE_TYPE_GROUP], principal),
			v1alpha1.ACL_RESOURCE_TYPE_CLUSTER:          s.newStdACLResource(v1alpha1.ACL_RESOURCE_TYPE_CLUSTER, resourceNames[v1alpha1.ACL_RESOURCE_TYPE_CLUSTER], principal),
		}
		assert.Len(filteredResources, len(expectedResources))

		for _, res := range filteredResources {
			protocmp.AssertProtoEqual(t, expectedResources[res.ResourceType], res)
			delete(expectedResources, res.ResourceType)
		}

		// Check if all expected resources have been matched
		assert.Len(expectedResources, 0)
	})

	t.Run("list ACLs with invalid filter (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		client := v1alpha1connect.NewACLServiceClient(http.DefaultClient, s.httpAddress())
		_, err := client.ListACLs(ctx, connect.NewRequest(&v1alpha1.ListACLsRequest{
			Filter: &v1alpha1.ACL_Filter{
				ResourceType:   v1alpha1.ACL_RESOURCE_TYPE_ANY,
				PermissionType: v1alpha1.ACL_PermissionType(999),
			},
		}))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	t.Run("list ACLs with default request (http)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// 1. Seed some ACLs
		principal := "User:test"
		resourceNamePrefix := "console-test-"

		resourceNames := map[v1alpha1.ACL_ResourceType]string{
			v1alpha1.ACL_RESOURCE_TYPE_GROUP:            fmt.Sprintf("%vgroup", resourceNamePrefix),
			v1alpha1.ACL_RESOURCE_TYPE_TOPIC:            fmt.Sprintf("%vtopic", resourceNamePrefix),
			v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID: fmt.Sprintf("%vtransactional-id", resourceNamePrefix),
			v1alpha1.ACL_RESOURCE_TYPE_CLUSTER:          "kafka-cluster",
		}

		acls := kadm.NewACLs().
			Allow(principal).
			ResourcePatternType(kadm.ACLPatternLiteral).
			Groups(resourceNames[v1alpha1.ACL_RESOURCE_TYPE_GROUP]).
			Topics(resourceNames[v1alpha1.ACL_RESOURCE_TYPE_TOPIC]).
			TransactionalIDs(resourceNames[v1alpha1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID]).
			Clusters().
			Operations(kadm.OpAll)

		err := acls.ValidateCreate()
		require.NoError(err)

		_, err = s.kafkaAdminClient.CreateACLs(ctx, acls)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.DeleteAllACLs(ctx)
			assert.NoError(err, "failed to delete all ACLs")
		}()

		// 2. List ACLs via HTTP API
		type listAclsResponse struct {
			Resources []struct {
				ResourceType        string `json:"resource_type"`
				ResourceName        string `json:"resource_name"`
				ResourcePatternType string `json:"resource_pattern_type"`
				ACLs                []struct {
					Principal      string `json:"principal"`
					Host           string `json:"host"`
					Operation      string `json:"operation"`
					PermissionType string `json:"permission_type"`
				} `json:"acls"`
			} `json:"resources"`
		}
		var response listAclsResponse
		err = requests.
			URL(s.httpAddress() + "/v1alpha1/").
			Path("acls").
			CheckStatus(http.StatusOK). // Allows 2xx otherwise
			ToJSON(&response).
			Fetch(ctx)
		require.NoError(err)
		assert.GreaterOrEqual(len(response.Resources), 4)
	})
}
