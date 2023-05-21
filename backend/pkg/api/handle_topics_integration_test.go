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
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/testutil"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

func (s *APIIntegrationTestSuite) TestHandleGetTopics() {
	// s.T().Skip("Asdf")
	t := s.T()
	// require := require.New(t)
	assert := assert.New(t)

	logCfg := zap.NewDevelopmentConfig()
	logCfg.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	// log, err := logCfg.Build()
	// require.NoError(err)

	// create some test topics
	testutil.CreateTestData(t, context.Background(), s.kafkaClient, s.kafkaAdminClient,
		testutil.TopicNameForTest("get_topics_0"))

	testutil.CreateTestData(t, context.Background(), s.kafkaClient, s.kafkaAdminClient,
		testutil.TopicNameForTest("get_topics_1"))

	testutil.CreateTestData(t, context.Background(), s.kafkaClient, s.kafkaAdminClient,
		testutil.TopicNameForTest("get_topics_2"))

	defer func() {
		s.kafkaAdminClient.DeleteTopics(context.Background(),
			testutil.TopicNameForTest("get_topics_0"),
			testutil.TopicNameForTest("get_topics_1"),
			testutil.TopicNameForTest("get_topics_2"))
	}()

	t.Run("happy path", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		res, body := s.apiRequest(ctx, http.MethodGet, "/api/topics", nil)

		assert.Equal(200, res.StatusCode)

		type response struct {
			Topics []*console.TopicSummary `json:"topics"`
		}

		getRes := response{}

		err := json.Unmarshal(body, &getRes)
		assert.NoError(err)

		assert.Len(getRes.Topics, 3)
		assert.Equal(testutil.TopicNameForTest("get_topics_0"), getRes.Topics[0].TopicName)
		assert.Equal(testutil.TopicNameForTest("get_topics_1"), getRes.Topics[1].TopicName)
		assert.Equal(testutil.TopicNameForTest("get_topics_2"), getRes.Topics[2].TopicName)
	})
}
