// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package api

import (
	"context"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	v1pb "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha"
	v1ac "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha/consolev1alphaconnect"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func (s *APIIntegrationTestSuite) TestListMessages() {
	fmt.Println("!!! TestListMessages")

	t := s.T()

	require := require.New(t)
	assert := assert.New(t)

	// setup
	ctx := context.Background()

	client := v1ac.NewConsoleServiceClient(
		http.DefaultClient,
		s.httpAddress(),
		connect.WithGRPCWeb(), // use GRPCWeb because we also expect this endpoint to be called by web client
	)

	topicName := testutil.TopicNameForTest("list_messages_0")
	testutil.CreateTestData(t, context.Background(), s.kafkaClient, s.kafkaAdminClient,
		topicName)

	stream, err := client.ListMessages(ctx, connect.NewRequest(&v1pb.ListMessagesRequest{
		Topic:       topicName,
		StartOffset: -2,
		PartitionId: -1,
		MaxResults:  100,
	}))
	require.NoError(err)

	keys := make([]string, 0, 20)
	for stream.Receive() {
		msg := stream.Msg()
		key := string(msg.GetKey().DeserializedPayload)
		keys = append(keys, key)
		fmt.Println("key:", key)
	}

	assert.Nil(stream.Err())
	assert.Nil(stream.Close())
	assert.Equal(
		[]string{"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"},
		keys)

	fmt.Println("!!! TestListMessages DONE !!!")
	fmt.Println("keys:", keys)
	assert.Fail("asdf")
}
