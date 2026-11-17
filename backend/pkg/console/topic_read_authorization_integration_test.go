// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package console

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sasl/scram"
	"go.uber.org/mock/gomock"

	"github.com/redpanda-data/console/backend/pkg/testutil"
)

type saslClientFactory struct {
	t        *testing.T
	brokers  []string
	username string
	password string
}

func (f *saslClientFactory) GetKafkaClient(context.Context) (*kgo.Client, *kadm.Client, error) {
	kafkaCl, adminCl := testutil.CreateClients(f.t, f.brokers,
		kgo.SASL(scram.Auth{User: f.username, Pass: f.password}.AsSha256Mechanism()))
	f.t.Cleanup(kafkaCl.Close)
	return kafkaCl, adminCl, nil
}

// TestTopicReadAuthorization covers a principal that may describe a topic but not read it, as
// an impersonated Console user with only DESCRIBE and DESCRIBE_CONFIGS ACLs is.
func TestTopicReadAuthorization(t *testing.T) {
	ctx := t.Context()

	const (
		adminUser   = "superuser-1"
		limitedUser = "describe-only"
		password    = "test"
	)

	container, err := redpanda.Run(ctx, testutil.RedpandaImage(),
		redpanda.WithEnableSASL(),
		redpanda.WithEnableKafkaAuthorization(),
		redpanda.WithNewServiceAccount(adminUser, password),
		redpanda.WithNewServiceAccount(limitedUser, password),
		redpanda.WithSuperusers(adminUser),
	)
	testutil.LogContainerLogsIfFailed(ctx, t, container, err)
	require.NoError(t, err)
	t.Cleanup(func() { assert.NoError(t, container.Terminate(context.Background())) })

	seedBroker, err := container.KafkaSeedBroker(ctx)
	require.NoError(t, err)

	adminFactory := &saslClientFactory{t: t, brokers: []string{seedBroker}, username: adminUser, password: password}
	adminKafkaCl, adminCl, err := adminFactory.GetKafkaClient(ctx)
	require.NoError(t, err)

	topicName := testutil.TopicNameForTest("read_authorization")
	testutil.CreateTestData(t, ctx, adminKafkaCl, adminCl, topicName)

	acl := kadm.NewACLs().
		Allow("User:"+limitedUser).
		Topics(topicName).
		ResourcePatternType(kadm.ACLPatternLiteral).
		Operations(kadm.OpDescribe, kadm.OpDescribeConfigs)
	aclResults, err := adminCl.CreateACLs(ctx, acl)
	require.NoError(t, err)
	for _, res := range aclResults {
		require.NoError(t, res.Err)
	}

	log := slog.New(slog.DiscardHandler)
	limitedFactory := &saslClientFactory{t: t, brokers: []string{seedBroker}, username: limitedUser, password: password}

	t.Run("topic overview reports the actions the principal may perform", func(t *testing.T) {
		svc := createNewTestServiceWithKafkaFactory(t, log, t.Name(), seedBroker, "", limitedFactory)

		topics, err := svc.GetTopicsOverview(ctx)
		require.NoError(t, err)
		require.Len(t, topics, 1)
		assert.Equal(t, topicName, topics[0].TopicName)
		assert.ElementsMatch(t,
			[]string{topicActionSeeTopic, topicActionViewPartitions, topicActionViewConsumers, topicActionViewConfig},
			topics[0].AllowedActions)

		adminSvc := createNewTestServiceWithKafkaFactory(t, log, t.Name()+"Admin", seedBroker, "", adminFactory)
		adminTopics, err := adminSvc.GetTopicsOverview(ctx)
		require.NoError(t, err)
		require.Len(t, adminTopics, 1)
		assert.Equal(t, []string{topicActionAll}, adminTopics[0].AllowedActions)
	})

	t.Run("list messages fails fast when the topic is not readable", func(t *testing.T) {
		svc := createNewTestServiceWithKafkaFactory(t, log, t.Name(), seedBroker, "", limitedFactory)

		mockCtrl := gomock.NewController(t)
		mockProgress := NewMockIListMessagesProgress(mockCtrl)
		mockProgress.EXPECT().OnPhase(gomock.Any()).AnyTimes()
		mockProgress.EXPECT().OnMessageConsumed(gomock.Any()).Times(0)
		mockProgress.EXPECT().OnMessage(gomock.Any()).Times(0)
		mockProgress.EXPECT().OnComplete(gomock.Any(), gomock.Any(), gomock.Any()).Times(0)
		var reported string
		mockProgress.EXPECT().OnError(gomock.Any()).Do(func(msg string) { reported = msg }).Times(1)

		// Well below the 35s the Connect handler allows a non-streaming search.
		listCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()

		err := svc.ListMessages(listCtx, ListMessageRequest{
			TopicName:    topicName,
			PartitionID:  partitionsAll,
			StartOffset:  StartOffsetOldest,
			MessageCount: 10,
		}, mockProgress)
		require.NoError(t, err)
		require.NoError(t, listCtx.Err(), "search ran until the deadline instead of failing fast")
		assert.Contains(t, reported, errTopicReadNotAuthorized.Error())
		assert.Contains(t, reported, "TOPIC_AUTHORIZATION_FAILED")
	})
}
