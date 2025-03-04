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
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/protocmp"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	v1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

func (s *APISuite) DeleteAllACLs_v1(ctx context.Context) error {
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

//nolint:unparam // Principal always receives "User:test" as of now, but good to keep for clarity
func (*APISuite) newStdACLResource_v1(resourceType v1.ACL_ResourceType, resourceName string, principal string) *v1.ListACLsResponse_Resource {
	return &v1.ListACLsResponse_Resource{
		ResourceType:        resourceType,
		ResourceName:        resourceName,
		ResourcePatternType: v1.ACL_RESOURCE_PATTERN_TYPE_LITERAL,
		Acls: []*v1.ListACLsResponse_Policy{
			{
				Principal:      principal,
				Host:           "*",
				Operation:      v1.ACL_OPERATION_ALL,
				PermissionType: v1.ACL_PERMISSION_TYPE_ALLOW,
			},
		},
	}
}

func (s *APISuite) TestCreateACL_v1() {
	t := s.T()

	t.Run("create ACL with default request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create ACL via Connect API call
		client := v1connect.NewACLServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1.CreateACLRequest{
			ResourceType:        v1.ACL_RESOURCE_TYPE_TOPIC,
			ResourceName:        "*",
			ResourcePatternType: v1.ACL_RESOURCE_PATTERN_TYPE_LITERAL,
			Principal:           "User:console-create-acl-test-connect-go",
			Host:                "*",
			Operation:           v1.ACL_OPERATION_ALL,
			PermissionType:      v1.ACL_PERMISSION_TYPE_ALLOW,
		}
		_, err := client.CreateACL(ctx, connect.NewRequest(createReq))
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.DeleteAllACLs_v1(ctx)
			assert.NoError(err, "failed to delete all ACLs")
		}()

		// 2. List ACLs via Kafka API
		describeReq := kadm.NewACLs().
			Allow("User:console-create-acl-test-connect-go").
			AllowHosts("*").
			ResourcePatternType(kadm.ACLPatternLiteral).
			Operations(kadm.OpAll).
			Topics("*")
		describeResults, err := s.kafkaAdminClient.DescribeACLs(ctx, describeReq)
		require.NoError(err)
		require.Len(describeResults, 1)
		describeResult := describeResults[0]
		assert.NoError(describeResult.Err)
		assert.Equal(describeResult.Name, kadm.StringPtr("*"))
		assert.Equal(describeResult.Operation, kadm.OpAll)
		assert.Equal(*describeResult.Principal, "User:console-create-acl-test-connect-go")
		assert.Equal(*describeResult.Host, "*")
		assert.Equal(describeResult.Type, kmsg.ACLResourceTypeTopic)
		assert.Equal(describeResult.Pattern, kmsg.ACLResourcePatternTypeLiteral)
		assert.Equal(describeResult.Permission, kmsg.ACLPermissionTypeAllow)
	})

	t.Run("create ACL with default request (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// 1. Create one ACL via HTTP API
		type createACLRequest struct {
			Host                string `json:"host"`
			Operation           string `json:"operation"`
			PermissionType      string `json:"permission_type"`
			Principal           string `json:"principal"`
			ResourceName        string `json:"resource_name"`
			ResourcePatternType string `json:"resource_pattern_type"`
			ResourceType        string `json:"resource_type"`
		}

		httpReq := createACLRequest{
			Host:                "*",
			Operation:           "OPERATION_ALL",
			PermissionType:      "PERMISSION_TYPE_ALLOW",
			Principal:           "User:console-create-acl-test-http",
			ResourceName:        "*",
			ResourcePatternType: "RESOURCE_PATTERN_TYPE_LITERAL",
			ResourceType:        "RESOURCE_TYPE_TOPIC",
		}
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1/acls").
			BodyJSON(&httpReq).
			Post().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusCreated), // Allows 2xx otherwise
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.DeleteAllACLs_v1(ctx)
			assert.NoError(err, "failed to delete all ACLs")
		}()

		// 2. List ACLs via Kafka API
		describeReq := kadm.NewACLs().
			Allow("User:console-create-acl-test-http").
			AllowHosts("*").
			ResourcePatternType(kadm.ACLPatternLiteral).
			Operations(kadm.OpAll).
			Topics("*")
		describeResults, err := s.kafkaAdminClient.DescribeACLs(ctx, describeReq)
		require.NoError(err)
		require.Len(describeResults, 1)
		describeResult := describeResults[0]
		assert.NoError(describeResult.Err)
		assert.Equal(*describeResult.Name, "*")
		assert.Equal(describeResult.Operation, kadm.OpAll)
		assert.Equal(*describeResult.Principal, "User:console-create-acl-test-http")
		assert.Equal(*describeResult.Host, "*")
		assert.Equal(describeResult.Type, kmsg.ACLResourceTypeTopic)
		assert.Equal(describeResult.Pattern, kmsg.ACLResourcePatternTypeLiteral)
		assert.Equal(describeResult.Permission, kmsg.ACLPermissionTypeAllow)
	})

	t.Run("create bad ACL create request (http)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()

		// Send incomplete ACL create request via HTTP API
		type createACLRequest struct {
			Host                string `json:"host"`
			Operation           string `json:"operation"`
			PermissionType      string `json:"permission_type"`
			Principal           string `json:"principal"`
			ResourceName        string `json:"resource_name"`
			ResourcePatternType string `json:"resource_pattern_type"`
			ResourceType        string `json:"resource_type,omitempty"` // Omitempty to simulate the bad request with missing Resource Type
		}

		httpReq := createACLRequest{
			Host:                "*",
			Operation:           "OPERATION_ALL",
			PermissionType:      "PERMISSION_TYPE_ALLOW",
			Principal:           "User:console-create-acl-test-http",
			ResourceName:        "*",
			ResourcePatternType: "RESOURCE_PATTERN_TYPE_LITERAL",
			// Omit the ResourceType - all of these fields are mandatory
			// ResourceType:        "RESOURCE_TYPE_TOPIC",
		}
		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1/acls").
			BodyJSON(&httpReq).
			Post().
			AddValidator(requests.ValidatorHandler(
				func(res *http.Response) error {
					assert.Equal(http.StatusBadRequest, res.StatusCode)
					if res.StatusCode != http.StatusCreated {
						return fmt.Errorf("unexpected status code: %d", res.StatusCode)
					}
					return nil
				},
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Error(err)
		assert.NotEmpty(errResponse)
		// Field name indicator is the most important information
		assert.Contains(errResponse, "resource_type")

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.DeleteAllACLs_v1(ctx)
			assert.NoError(err, "failed to delete all ACLs")
		}()
	})
}

func (s *APISuite) TestListACLs_v1() {
	t := s.T()

	t.Run("list ACLs with default request (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// 1. Seed some ACLs
		principal := "User:test"
		resourceNamePrefix := "console-test-"

		resourceNames := map[v1.ACL_ResourceType]string{
			v1.ACL_RESOURCE_TYPE_GROUP:            fmt.Sprintf("%vgroup", resourceNamePrefix),
			v1.ACL_RESOURCE_TYPE_TOPIC:            fmt.Sprintf("%vtopic", resourceNamePrefix),
			v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID: fmt.Sprintf("%vtransactional-id", resourceNamePrefix),
			v1.ACL_RESOURCE_TYPE_CLUSTER:          "kafka-cluster",
		}

		acls := kadm.NewACLs().
			Allow(principal).
			ResourcePatternType(kadm.ACLPatternLiteral).
			Groups(resourceNames[v1.ACL_RESOURCE_TYPE_GROUP]).
			Topics(resourceNames[v1.ACL_RESOURCE_TYPE_TOPIC]).
			TransactionalIDs(resourceNames[v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID]).
			Clusters().
			Operations(kadm.OpAll)

		err := acls.ValidateCreate()
		require.NoError(err)

		_, err = s.kafkaAdminClient.CreateACLs(ctx, acls)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.DeleteAllACLs_v1(ctx)
			assert.NoError(err, "failed to delete all ACLs")
		}()

		// 2. List ACLs
		client := v1connect.NewACLServiceClient(http.DefaultClient, s.httpAddress())
		res, err := client.ListACLs(ctx, connect.NewRequest(&v1.ListACLsRequest{}))
		require.NoError(err)
		require.NotNil(res.Msg, "response message must not be nil")
		require.GreaterOrEqual(len(res.Msg.Resources), 4)

		// 3. From all ACLs returned by the Kafka API, filter only those that match
		// the patterns of the seeded ACLs. There may be existing system-internal ACLs,
		// see: https://github.com/redpanda-data/redpanda/issues/14373 .
		filteredResources := make([]*v1.ListACLsResponse_Resource, 0)
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
		expectedResources := map[v1.ACL_ResourceType]*v1.ListACLsResponse_Resource{
			v1.ACL_RESOURCE_TYPE_TOPIC:            s.newStdACLResource_v1(v1.ACL_RESOURCE_TYPE_TOPIC, resourceNames[v1.ACL_RESOURCE_TYPE_TOPIC], principal),
			v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID: s.newStdACLResource_v1(v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID, resourceNames[v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID], principal),
			v1.ACL_RESOURCE_TYPE_GROUP:            s.newStdACLResource_v1(v1.ACL_RESOURCE_TYPE_GROUP, resourceNames[v1.ACL_RESOURCE_TYPE_GROUP], principal),
			v1.ACL_RESOURCE_TYPE_CLUSTER:          s.newStdACLResource_v1(v1.ACL_RESOURCE_TYPE_CLUSTER, resourceNames[v1.ACL_RESOURCE_TYPE_CLUSTER], principal),
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
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		client := v1connect.NewACLServiceClient(http.DefaultClient, s.httpAddress())
		_, err := client.ListACLs(ctx, connect.NewRequest(&v1.ListACLsRequest{
			Filter: &v1.ListACLsRequest_Filter{
				ResourceType:   v1.ACL_RESOURCE_TYPE_ANY,
				PermissionType: v1.ACL_PermissionType(999),
			},
		}))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	t.Run("list ACLs with default request (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// 1. Seed some ACLs
		principal := "User:test"
		resourceNamePrefix := "console-test-"

		resourceNames := map[v1.ACL_ResourceType]string{
			v1.ACL_RESOURCE_TYPE_GROUP:            fmt.Sprintf("%vgroup", resourceNamePrefix),
			v1.ACL_RESOURCE_TYPE_TOPIC:            fmt.Sprintf("%vtopic", resourceNamePrefix),
			v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID: fmt.Sprintf("%vtransactional-id", resourceNamePrefix),
			v1.ACL_RESOURCE_TYPE_CLUSTER:          "kafka-cluster",
		}

		acls := kadm.NewACLs().
			Allow(principal).
			ResourcePatternType(kadm.ACLPatternLiteral).
			Groups(resourceNames[v1.ACL_RESOURCE_TYPE_GROUP]).
			Topics(resourceNames[v1.ACL_RESOURCE_TYPE_TOPIC]).
			TransactionalIDs(resourceNames[v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID]).
			Clusters().
			Operations(kadm.OpAll)

		err := acls.ValidateCreate()
		require.NoError(err)

		_, err = s.kafkaAdminClient.CreateACLs(ctx, acls)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.DeleteAllACLs_v1(ctx)
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
		var errResponse string
		err = requests.
			URL(s.httpAddress() + "/v1/").
			Path("acls").
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			ToJSON(&response).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		assert.GreaterOrEqual(len(response.Resources), 4)
	})
}

func (s *APISuite) TestDeleteACLs_v1() {
	t := s.T()

	t.Run("delete ACLs with a filter that matches all three created ACLs (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// 1. Seed some ACLs
		principal := "User:test"
		resourceNamePrefix := "console-deletion-test-"

		resourceNames := map[v1.ACL_ResourceType]string{
			v1.ACL_RESOURCE_TYPE_GROUP:            fmt.Sprintf("%vgroup", resourceNamePrefix),
			v1.ACL_RESOURCE_TYPE_TOPIC:            fmt.Sprintf("%vtopic", resourceNamePrefix),
			v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID: fmt.Sprintf("%vtransactional-id", resourceNamePrefix),
		}

		acls := kadm.NewACLs().
			Allow(principal).
			ResourcePatternType(kadm.ACLPatternLiteral).
			Groups(resourceNames[v1.ACL_RESOURCE_TYPE_GROUP]).
			Topics(resourceNames[v1.ACL_RESOURCE_TYPE_TOPIC]).
			TransactionalIDs(resourceNames[v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID]).
			Operations(kadm.OpAll)

		err := acls.ValidateCreate()
		require.NoError(err)

		_, err = s.kafkaAdminClient.CreateACLs(ctx, acls)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.DeleteAllACLs_v1(ctx)
			assert.NoError(err, "failed to delete all ACLs")
		}()

		// 2. Delete ACLs
		client := v1connect.NewACLServiceClient(http.DefaultClient, s.httpAddress())

		// Resource name is not specified and therefore matches all resources
		deleteRequest := &v1.DeleteACLsRequest{
			Filter: &v1.DeleteACLsRequest_Filter{
				ResourceType:        v1.ACL_RESOURCE_TYPE_ANY,
				ResourcePatternType: v1.ACL_RESOURCE_PATTERN_TYPE_LITERAL,
				Principal:           kmsg.StringPtr(principal),
				Host:                kmsg.StringPtr("*"),
				Operation:           v1.ACL_OPERATION_ALL,
				PermissionType:      v1.ACL_PERMISSION_TYPE_ALLOW,
			},
		}
		response, err := client.DeleteACLs(ctx, connect.NewRequest(deleteRequest))
		require.NoError(err)
		assert.Len(response.Msg.MatchingAcls, len(resourceNames))
	})

	t.Run("delete ACLs with invalid filter (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// The ACL filter for deletions must be complete (all fields must be set)
		// as this could otherwise cause more ACLs to be deleted than desired.
		client := v1connect.NewACLServiceClient(http.DefaultClient, s.httpAddress())
		_, err := client.DeleteACLs(ctx, connect.NewRequest(&v1.DeleteACLsRequest{
			Filter: &v1.DeleteACLsRequest_Filter{
				ResourceType:   v1.ACL_RESOURCE_TYPE_ANY,
				PermissionType: v1.ACL_PermissionType(999),
			},
		}))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	t.Run("delete ACLs with a filter that matches all three created ACLs (http)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// 1. Seed some ACLs
		principal := "User:test"
		resourceNamePrefix := "console-deletion-test-"

		resourceNames := map[v1.ACL_ResourceType]string{
			v1.ACL_RESOURCE_TYPE_GROUP:            fmt.Sprintf("%vgroup", resourceNamePrefix),
			v1.ACL_RESOURCE_TYPE_TOPIC:            fmt.Sprintf("%vtopic", resourceNamePrefix),
			v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID: fmt.Sprintf("%vtransactional-id", resourceNamePrefix),
		}

		acls := kadm.NewACLs().
			Allow(principal).
			ResourcePatternType(kadm.ACLPatternLiteral).
			Groups(resourceNames[v1.ACL_RESOURCE_TYPE_GROUP]).
			Topics(resourceNames[v1.ACL_RESOURCE_TYPE_TOPIC]).
			TransactionalIDs(resourceNames[v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID]).
			Operations(kadm.OpAll)

		err := acls.ValidateCreate()
		require.NoError(err)

		_, err = s.kafkaAdminClient.CreateACLs(ctx, acls)
		require.NoError(err)

		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.DeleteAllACLs_v1(ctx)
			assert.NoError(err, "failed to delete all ACLs")
		}()

		// 2. Delete ACLs via HTTP API
		type deleteAclsResponse struct {
			MatchingACLs []map[string]any `json:"matching_acls"`
		}
		var response deleteAclsResponse
		var errResponse string
		// Resource name is not provided as part of the filter and therefore matches all resource names
		err = requests.
			URL(s.httpAddress()+"/v1/").
			Path("acls").
			Delete().
			Param("filter.resource_type", "RESOURCE_TYPE_ANY").
			Param("filter.resource_pattern_type", "RESOURCE_PATTERN_TYPE_LITERAL").
			Param("filter.operation", "OPERATION_ANY").
			Param("filter.permission_type", "PERMISSION_TYPE_ANY").
			Param("filter.principal", principal).
			Param("filter.host", "*").
			CheckStatus(http.StatusOK).
			ToJSON(&response).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		assert.Equal(len(response.MatchingACLs), len(resourceNames))
	})

	t.Run("delete ACLs with missing filter (http)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// 1. Try to delete ACLs via HTTP API by not setting any filter at all
		var plainResponse string
		err := requests.
			URL(s.httpAddress() + "/v1/").
			Path("acls").
			Delete().
			CheckStatus(http.StatusBadRequest).
			ToString(&plainResponse).
			Fetch(ctx)
		assert.Contains(plainResponse, "INVALID_ARGUMENT")
		assert.NoError(err) // Status BadRequest is the expected status, hence no error

		// 2. Try to delete ACLs via HTTP API by using an empty filter object
		err = requests.
			URL(s.httpAddress()+"/v1/").
			Path("acls").
			Delete().
			Param("filter", "").
			CheckStatus(http.StatusBadRequest).
			ToString(&plainResponse).
			Fetch(ctx)
		assert.Contains(plainResponse, "INVALID_ARGUMENT")
		assert.NoError(err) // Status BadRequest is the expected status, hence no error
	})

	t.Run("delete ACLs with an invalid filter (http)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		var plainResponse string
		// 1. Try to delete ACLs via HTTP API by using an incomplete filter.
		// Below test misses the host field (that's okay), but it misses the operation
		err := requests.
			URL(s.httpAddress()+"/v1/").
			Path("acls").
			Delete().
			Param("filter.resource_type", "RESOURCE_TYPE_ANY").
			Param("filter.resource_name", "topic").
			Param("filter.resource_pattern_type", "RESOURCE_PATTERN_TYPE_PREFIXED").
			Param("filter.permission_type", "PERMISSION_TYPE_ANY").
			Param("filter.principal", "test").
			CheckStatus(http.StatusBadRequest).
			ToString(&plainResponse).
			Fetch(ctx)
		assert.Contains(plainResponse, "INVALID_ARGUMENT")
		assert.NoError(err) // Status BadRequest is the expected status, hence no error

		// 2. Try to delete ACLs via HTTP API by using an UNSPECIFIED enum
		err = requests.
			URL(s.httpAddress()+"/v1/").
			Path("acls").
			Delete().
			Param("filter.resource_type", "RESOURCE_TYPE_ANY").
			Param("filter.resource_name", "topic").
			Param("filter.resource_pattern_type", "RESOURCE_PATTERN_TYPE_PREFIXED").
			Param("filter.permission_type", "PERMISSION_TYPE_ANY").
			Param("filter.operation", "OPERATION_UNSPECIFIED").
			Param("filter.principal", "test").
			CheckStatus(http.StatusBadRequest).
			ToString(&plainResponse).
			Fetch(ctx)
		assert.Contains(plainResponse, "INVALID_ARGUMENT")
		assert.NoError(err) // Status BadRequest is the expected status, hence no error
	})
}
