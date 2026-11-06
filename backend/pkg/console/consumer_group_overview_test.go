// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/kversion"

	"github.com/redpanda-data/console/backend/pkg/config"
	kafkafactory "github.com/redpanda-data/console/backend/pkg/factory/kafka"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

const (
	classicGroupID = "orders-classic"
	kip848GroupID  = "orders-kip848"
	groupTestTopic = "orders"
)

type groupTestEnv struct {
	cluster *kfake.Cluster
	admin   *kadm.Client
	svc     *Service
}

func newGroupTestEnv(t *testing.T, ctx context.Context) *groupTestEnv {
	t.Helper()
	// Kafka 4.0 serves ListGroups v5 and ConsumerGroupDescribe v1. Its OffsetFetch v10
	// carries topic IDs in place of names, which kadm v1.18 does not resolve, so the
	// fake broker stops at v9 there, as Redpanda does.
	versions := kversion.V4_0_0()
	versions.SetMaxKeyVersion(int16(kmsg.OffsetFetch), 9)
	fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1), kfake.MaxVersions(versions))
	require.NoError(t, err)
	t.Cleanup(fakeCluster.Close)

	client, adminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs(), kgo.MaxVersions(kversion.Stable()))
	t.Cleanup(client.Close)

	_, err = adminClient.CreateTopic(ctx, 2, 1, nil, groupTestTopic)
	require.NoError(t, err)
	for i := range 4 {
		res := client.ProduceSync(ctx, &kgo.Record{Topic: groupTestTopic, Key: []byte(fmt.Sprint(i)), Value: []byte("order")})
		require.NoError(t, res.FirstErr())
	}

	quiet := slog.New(slog.NewTextHandler(nil, &slog.HandlerOptions{Level: slog.LevelError + 1}))
	cfg := config.Config{Kafka: config.Kafka{Brokers: fakeCluster.ListenAddrs()}}
	svc := &Service{
		kafkaClientFactory: kafkafactory.NewCachedClientProvider(&cfg, quiet, prometheus.NewRegistry()),
		logger:             quiet,
	}
	return &groupTestEnv{cluster: fakeCluster, admin: adminClient, svc: svc}
}

// joinGroup starts a consumer in the group, consumes until it holds an assignment and commits.
// With kip848 set, the client uses the KIP-848 protocol, which kgo gates behind a context key.
func (e *groupTestEnv) joinGroup(t *testing.T, ctx context.Context, groupID string, kip848 bool) *kgo.Client {
	t.Helper()
	opts := []kgo.Opt{
		kgo.SeedBrokers(e.cluster.ListenAddrs()...),
		kgo.ConsumerGroup(groupID),
		kgo.ConsumeTopics(groupTestTopic),
		kgo.Balancers(kgo.RangeBalancer()),
		kgo.ClientID(groupID + "-client"),
	}
	if kip848 {
		//nolint:staticcheck // kgo reads this string key, see kgo/consumer_group_848.go
		opts = append(opts, kgo.WithContext(context.WithValue(ctx, "opt_in_kafka_next_gen_balancer_beta", true)))
	}
	cl, err := kgo.NewClient(opts...)
	require.NoError(t, err)
	t.Cleanup(cl.Close)

	fetches := cl.PollFetches(ctx)
	require.NoError(t, fetches.Err())
	require.NoError(t, cl.CommitUncommittedOffsets(ctx))
	e.waitForState(t, ctx, groupID, "Stable")
	return cl
}

func (e *groupTestEnv) waitForState(t *testing.T, ctx context.Context, groupID, state string) {
	t.Helper()
	require.Eventually(t, func() bool {
		listed, err := e.admin.ListGroups(ctx)
		if err != nil {
			return false
		}
		g, ok := listed[groupID]
		return ok && strings.EqualFold(g.State, state)
	}, 15*time.Second, 100*time.Millisecond, "group %q did not reach state %q", groupID, state)
}

func TestGetConsumerGroupsOverview_GroupTypes(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()
	env := newGroupTestEnv(t, ctx)
	env.joinGroup(t, ctx, classicGroupID, false)
	env.joinGroup(t, ctx, kip848GroupID, true)

	groups, restErr := env.svc.GetConsumerGroupsOverview(ctx, nil)
	require.Nil(t, restErr)
	require.Len(t, groups, 2)
	byID := make(map[string]ConsumerGroupOverview, len(groups))
	for _, g := range groups {
		byID[g.GroupID] = g
	}

	classic := byID[classicGroupID]
	assert.Equal(t, GroupTypeClassic, classic.GroupType)
	assert.Equal(t, "Stable", classic.State)
	assert.Equal(t, "consumer", classic.ProtocolType)
	assert.Equal(t, "range", classic.Protocol)
	assert.Nil(t, classic.GroupEpoch)
	assert.Nil(t, classic.TargetAssignmentEpoch)
	require.Len(t, classic.Members, 1)
	assert.Nil(t, classic.Members[0].MemberEpoch)
	assert.Empty(t, classic.Members[0].TargetAssignments)
	require.Len(t, classic.Members[0].Assignments, 1)
	assert.Equal(t, groupTestTopic, classic.Members[0].Assignments[0].TopicName)

	consumer := byID[kip848GroupID]
	assert.Equal(t, GroupTypeConsumer, consumer.GroupType)
	assert.Equal(t, "Stable", consumer.State)
	assert.Equal(t, "consumer", consumer.ProtocolType)
	assert.NotEmpty(t, consumer.Protocol, "the assignor name is the protocol of a consumer group")
	require.NotNil(t, consumer.GroupEpoch)
	require.NotNil(t, consumer.TargetAssignmentEpoch)
	assert.Equal(t, *consumer.GroupEpoch, *consumer.TargetAssignmentEpoch)
	require.Len(t, consumer.Members, 1)
	m := consumer.Members[0]
	assert.Equal(t, kip848GroupID+"-client", m.ClientID)
	require.NotNil(t, m.MemberEpoch)
	assert.Equal(t, *consumer.GroupEpoch, *m.MemberEpoch)
	require.Len(t, m.Assignments, 1)
	assert.Equal(t, groupTestTopic, m.Assignments[0].TopicName)
	assert.ElementsMatch(t, []int32{0, 1}, m.Assignments[0].PartitionIDs)
	assert.Equal(t, m.Assignments, m.TargetAssignments)
	assert.Equal(t, []string{groupTestTopic}, m.SubscribedTopics)
	require.Len(t, consumer.TopicOffsets, 1, "%+v", consumer.TopicOffsets)
	assert.Equal(t, groupTestTopic, consumer.TopicOffsets[0].Topic, "%+v", consumer.TopicOffsets)

	one, restErr := env.svc.GetConsumerGroupsOverview(ctx, []string{kip848GroupID})
	require.Nil(t, restErr)
	require.Len(t, one, 1)
	assert.Equal(t, kip848GroupID, one[0].GroupID)

	_, restErr = env.svc.GetConsumerGroupsOverview(ctx, []string{"does-not-exist"})
	require.NotNil(t, restErr)
	assert.Equal(t, http.StatusNotFound, restErr.Status)
}

func TestGetConsumerGroupsOverview_DescribeConsumerGroupsFails(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()
	env := newGroupTestEnv(t, ctx)
	env.joinGroup(t, ctx, kip848GroupID, true)

	// A broker that lists KIP-848 groups but cannot describe them, such as Redpanda with
	// group_consumer_protocol_enabled switched off after the groups were created.
	env.cluster.ControlKey(int16(kmsg.ConsumerGroupDescribe), func(req kmsg.Request) (kmsg.Response, error, bool) {
		env.cluster.KeepControl()
		describeReq := req.(*kmsg.ConsumerGroupDescribeRequest)
		resp := describeReq.ResponseKind().(*kmsg.ConsumerGroupDescribeResponse)
		resp.Version = describeReq.Version
		for _, g := range describeReq.Groups {
			rg := kmsg.NewConsumerGroupDescribeResponseGroup()
			rg.Group = g
			rg.ErrorCode = kerr.UnsupportedVersion.Code
			resp.Groups = append(resp.Groups, rg)
		}
		return resp, nil, true
	})

	groups, restErr := env.svc.GetConsumerGroupsOverview(ctx, nil)
	require.Nil(t, restErr)
	require.Len(t, groups, 1)
	g := groups[0]
	assert.Equal(t, kip848GroupID, g.GroupID)
	assert.Equal(t, GroupTypeConsumer, g.GroupType)
	assert.Equal(t, "Stable", g.State, "the state comes from ListGroups")
	assert.Equal(t, "consumer", g.ProtocolType)
	assert.Empty(t, g.Protocol)
	assert.Nil(t, g.GroupEpoch)
	assert.Empty(t, g.Members)
	require.Len(t, g.TopicOffsets, 1)
}

func TestListGroups_BelowV5ReportsClassic(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()
	env := newGroupTestEnv(t, ctx)
	env.joinGroup(t, ctx, kip848GroupID, true)

	modern, _ := testutil.CreateClients(t, env.cluster.ListenAddrs(), kgo.MaxVersions(kversion.Stable()))
	t.Cleanup(modern.Close)
	listed, err := listGroups(ctx, modern)
	require.NoError(t, err)
	assert.Equal(t, GroupTypeConsumer, listed[kip848GroupID].Type)
	assert.Equal(t, "Stable", listed[kip848GroupID].State)

	// Kafka 3.7 serves ListGroups v4 at most, which carries no group type.
	old, _ := testutil.CreateClients(t, env.cluster.ListenAddrs(), kgo.MaxVersions(kversion.V3_7_0()))
	t.Cleanup(old.Close)
	listed, err = listGroups(ctx, old)
	require.NoError(t, err)
	assert.Equal(t, GroupTypeClassic, listed[kip848GroupID].Type)
}

func TestEditConsumerGroupOffsets_KIP848Group(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()
	env := newGroupTestEnv(t, ctx)
	member := env.joinGroup(t, ctx, kip848GroupID, true)

	topics := []kmsg.OffsetCommitRequestTopic{{
		Topic:      groupTestTopic,
		Partitions: []kmsg.OffsetCommitRequestTopicPartition{{Partition: 0, Offset: 0}},
	}}

	res, restErr := env.svc.EditConsumerGroupOffsets(ctx, kip848GroupID, topics)
	require.Nil(t, restErr)
	assert.Contains(t, res.Error, "still active")

	member.Close()
	env.waitForState(t, ctx, kip848GroupID, "Empty")

	res, restErr = env.svc.EditConsumerGroupOffsets(ctx, kip848GroupID, topics)
	require.Nil(t, restErr)
	assert.Empty(t, res.Error)
	require.Len(t, res.Topics, 1)
	require.Len(t, res.Topics[0].Partitions, 1)
	assert.Empty(t, res.Topics[0].Partitions[0].Error)

	_, restErr = env.svc.EditConsumerGroupOffsets(ctx, "does-not-exist", topics)
	require.NotNil(t, restErr)
	assert.Equal(t, http.StatusNotFound, restErr.Status)
}
