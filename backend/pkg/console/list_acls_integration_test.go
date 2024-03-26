// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package console

import (
	"context"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func (s *ConsoleIntegrationTestSuite) TestListACLs() {
	ctx := context.Background()
	t := s.T()
	assert := assert.New(t)
	require := require.New(t)

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	log, err := logCfg.Build()
	require.NoError(err)

	testTopicName := testutil.TopicNameForTest("test_list_acls_topic")
	_, err = s.kafkaAdminClient.CreateTopic(ctx, 1, 1, nil, testTopicName)
	require.NoError(err)

	timer1 := time.NewTimer(30 * time.Millisecond)
	<-timer1.C

	defer func() {
		s.kafkaAdminClient.DeleteTopics(ctx, testTopicName)
	}()

	aclReq := kmsg.NewCreateACLsRequestCreation()
	aclReq.PermissionType = kmsg.ACLPermissionTypeAllow
	aclReq.Operation = kmsg.ACLOperationAll
	aclReq.Host = "*"
	aclReq.Principal = "User:foo"
	aclReq.ResourcePatternType = kmsg.ACLResourcePatternTypePrefixed
	aclReq.ResourceName = testTopicName
	aclReq.ResourceType = kmsg.ACLResourceTypeTopic

	// aclReq2 := kmsg.NewCreateACLsRequestCreation()
	// aclReq2.PermissionType = kmsg.ACLPermissionTypeAllow
	// aclReq2.Operation = kmsg.ACLOperationAll
	// aclReq2.Host = "*"
	// aclReq2.Principal = "RedpandaRole:admin"
	// aclReq2.ResourcePatternType = kmsg.ACLResourcePatternTypePrefixed
	// aclReq2.ResourceName = testTopicName
	// aclReq2.ResourceType = kmsg.ACLResourceTypeTopic

	req := kmsg.NewCreateACLsRequest()
	req.Creations = []kmsg.CreateACLsRequestCreation{aclReq}

	_, err = req.RequestWith(ctx, s.kafkaClient)
	require.NoError(err)

	defer func() {
		host := "*"
		principal := "User:foo"

		aclReq := kmsg.NewDeleteACLsRequestFilter()
		aclReq.PermissionType = kmsg.ACLPermissionTypeAllow
		aclReq.Operation = kmsg.ACLOperationAll
		aclReq.Host = &host
		aclReq.Principal = &principal
		aclReq.ResourcePatternType = kmsg.ACLResourcePatternTypePrefixed
		aclReq.ResourceName = &testTopicName
		aclReq.ResourceType = kmsg.ACLResourceTypeTopic

		// principal2 := "RedpandaRole:admin"

		// aclReq2 := kmsg.NewDeleteACLsRequestFilter()
		// aclReq2.PermissionType = kmsg.ACLPermissionTypeAllow
		// aclReq2.Operation = kmsg.ACLOperationAll
		// aclReq2.Host = &host
		// aclReq2.Principal = &principal2
		// aclReq2.ResourcePatternType = kmsg.ACLResourcePatternTypePrefixed
		// aclReq2.ResourceName = &testTopicName
		// aclReq2.ResourceType = kmsg.ACLResourceTypeTopic

		delReq := kmsg.DeleteACLsRequest{
			Filters: []kmsg.DeleteACLsRequestFilter{aclReq},
		}

		_, err = delReq.RequestWith(ctx, s.kafkaClient)
		assert.NoError(err)
	}()

	svc := createNewTestService(t, log, "test_list_acls", s.testSeedBroker, s.registryAddr)

	res, err := svc.ListAllACLs(ctx, kmsg.DescribeACLsRequest{
		ResourceType:        kmsg.ACLResourceTypeAny,
		ResourcePatternType: kmsg.ACLResourcePatternTypeAny,
		Operation:           kmsg.ACLOperationAny,
		PermissionType:      kmsg.ACLPermissionTypeAny,
	})

	require.NoError(err)
	require.NotNil(res)

	require.Len(res.ACLResources, 1)
	require.Len(res.ACLResources[0].ACLs, 1)
	assert.Equal("User:foo", res.ACLResources[0].ACLs[0].Principal)
	assert.Equal(ACLPrincipalTypeUser, res.ACLResources[0].ACLs[0].PrincipalType)
	assert.Equal("foo", res.ACLResources[0].ACLs[0].PrincipalName)

	// require.Len(res.ACLResources[1].ACLs, 1)
	// assert.Equal("RedpandaRole:admin", res.ACLResources[1].ACLs[0].Principal)
	// assert.Equal(ACLPrincipalTypeRedpandaRole, res.ACLResources[1].ACLs[0].PrincipalType)
}
