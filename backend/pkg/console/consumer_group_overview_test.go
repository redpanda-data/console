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
	"cmp"
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"sync/atomic"
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
	// groupTestRecords are spread evenly over the two partitions of groupTestTopic.
	groupTestRecords = 4
)

type groupTestEnv struct {
	cluster *kfake.Cluster
	admin   *kadm.Client
	svc     *Service
}

func newGroupTestEnv(ctx context.Context, t *testing.T) *groupTestEnv {
	t.Helper()
	// Kafka 4.0 serves ListGroups v5 and ConsumerGroupDescribe v1. Its OffsetFetch v10
	// carries topic IDs in place of names, so the fake broker stops at v9 there, as
	// Redpanda does.
	versions := kversion.V4_0_0()
	versions.SetMaxKeyVersion(int16(kmsg.OffsetFetch), 9)
	fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(1), kfake.MaxVersions(versions))
	require.NoError(t, err)
	t.Cleanup(fakeCluster.Close)

	client, adminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs(),
		kgo.MaxVersions(kversion.Stable()), kgo.RecordPartitioner(kgo.ManualPartitioner()))
	t.Cleanup(client.Close)

	_, err = adminClient.CreateTopic(ctx, 2, 1, nil, groupTestTopic)
	require.NoError(t, err)
	for i := range groupTestRecords {
		res := client.ProduceSync(ctx, &kgo.Record{Topic: groupTestTopic, Partition: int32(i % 2), Value: []byte("order")})
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

// joinGroup starts a consumer in the group, consumes all records and commits. With kip848
// set, the client uses the KIP-848 protocol, which kgo gates behind a context key.
func (e *groupTestEnv) joinGroup(ctx context.Context, t *testing.T, groupID string, kip848 bool) *kgo.Client {
	t.Helper()
	opts := []kgo.Opt{
		kgo.SeedBrokers(e.cluster.ListenAddrs()...),
		kgo.ConsumerGroup(groupID),
		kgo.ConsumeTopics(groupTestTopic),
		kgo.Balancers(kgo.RangeBalancer()),
		kgo.ClientID(groupID + "-client"),
	}
	if kip848 {
		//nolint:staticcheck,revive // kgo reads this plain string key, see kgo/consumer_group_848.go
		opts = append(opts, kgo.WithContext(context.WithValue(ctx, "opt_in_kafka_next_gen_balancer_beta", true)))
	}
	cl, err := kgo.NewClient(opts...)
	require.NoError(t, err)
	t.Cleanup(cl.Close)

	for consumed := 0; consumed < groupTestRecords; {
		fetches := cl.PollFetches(ctx)
		require.NoError(t, fetches.Err())
		consumed += fetches.NumRecords()
	}
	require.NoError(t, cl.CommitUncommittedOffsets(ctx))
	e.waitForState(ctx, t, groupID, "Stable")
	return cl
}

func (e *groupTestEnv) waitForState(ctx context.Context, t *testing.T, groupID, state string) {
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

// nameAssignmentTopics makes the fake broker send the topic names of ConsumerGroupDescribe
// assignments, as Redpanda does. kfake sends the topic IDs only, so each request is forwarded
// to kfake through a second client and the names are filled in from the metadata.
func (e *groupTestEnv) nameAssignmentTopics(ctx context.Context, t *testing.T) {
	t.Helper()
	md, err := e.admin.Metadata(ctx, groupTestTopic)
	require.NoError(t, err)
	names := make(map[[16]byte]string, len(md.Topics))
	for name, td := range md.Topics {
		names[td.ID] = name
	}

	fwd, err := kgo.NewClient(kgo.SeedBrokers(e.cluster.ListenAddrs()...), kgo.MaxVersions(kversion.Stable()))
	require.NoError(t, err)
	t.Cleanup(fwd.Close)

	var forwarding atomic.Bool
	e.cluster.ControlKey(int16(kmsg.ConsumerGroupDescribe), func(req kmsg.Request) (kmsg.Response, error, bool) {
		e.cluster.KeepControl()
		if forwarding.Load() {
			return nil, nil, false
		}
		forwarding.Store(true)
		defer forwarding.Store(false)

		version := req.GetVersion()
		var (
			kresp  kmsg.Response
			fwdErr error
		)
		e.cluster.SleepControl(func() { kresp, fwdErr = fwd.Request(ctx, req) })
		if fwdErr != nil {
			return nil, fwdErr, true
		}
		resp, ok := kresp.(*kmsg.ConsumerGroupDescribeResponse)
		if !ok {
			return nil, fmt.Errorf("unexpected response type %T", kresp), true
		}
		resp.Version = version
		for i := range resp.Groups {
			for j := range resp.Groups[i].Members {
				m := &resp.Groups[i].Members[j]
				for _, a := range []*kmsg.Assignment{&m.Assignment, &m.TargetAssignment} {
					for k := range a.TopicPartitions {
						a.TopicPartitions[k].Topic = names[a.TopicPartitions[k].TopicID]
					}
				}
			}
		}
		return resp, nil, true
	})
}

// rejectConsumerGroupDescribe makes the fake broker list KIP-848 groups but fail to describe
// them, as Redpanda does with group_consumer_protocol_enabled switched off after the groups
// were created.
func (e *groupTestEnv) rejectConsumerGroupDescribe(t *testing.T) {
	t.Helper()
	e.cluster.ControlKey(int16(kmsg.ConsumerGroupDescribe), func(req kmsg.Request) (kmsg.Response, error, bool) {
		e.cluster.KeepControl()
		describeReq, ok := req.(*kmsg.ConsumerGroupDescribeRequest)
		require.True(t, ok, "unexpected request type %T", req)
		resp, ok := describeReq.ResponseKind().(*kmsg.ConsumerGroupDescribeResponse)
		require.True(t, ok)
		resp.Version = describeReq.Version
		for _, g := range describeReq.Groups {
			rg := kmsg.NewConsumerGroupDescribeResponseGroup()
			rg.Group = g
			rg.ErrorCode = kerr.UnsupportedVersion.Code
			resp.Groups = append(resp.Groups, rg)
		}
		return resp, nil, true
	})
}

// stable drops what changes between runs: the member IDs the broker generates, the client
// hosts with their ports, and the order of the partition offsets.
func stable(groups []ConsumerGroupOverview) []ConsumerGroupOverview {
	for _, g := range groups {
		for i := range g.Members {
			g.Members[i].ID = ""
			g.Members[i].ClientHost = ""
		}
		for _, to := range g.TopicOffsets {
			slices.SortFunc(to.PartitionOffsets, func(a, b PartitionOffsets) int { return cmp.Compare(a.PartitionID, b.PartitionID) })
		}
	}
	return groups
}

func TestGetConsumerGroupsOverview(t *testing.T) {
	committed := int64(groupTestRecords / 2)
	partitionOffsets := func(id int32) PartitionOffsets {
		return PartitionOffsets{PartitionID: id, GroupOffset: &committed, HighWaterMark: committed}
	}
	offsets := []GroupTopicOffsets{{
		Topic:                groupTestTopic,
		PartitionCount:       2,
		PartitionsWithOffset: 2,
		PartitionOffsets:     []PartitionOffsets{partitionOffsets(0), partitionOffsets(1)},
	}}
	assignment := []GroupMemberAssignment{{TopicName: groupTestTopic, PartitionIDs: []int32{0, 1}}}
	epoch := int32(1)

	classic := ConsumerGroupOverview{
		GroupID:      classicGroupID,
		GroupType:    GroupTypeClassic,
		State:        "Stable",
		ProtocolType: "consumer",
		Protocol:     "range",
		Members: []GroupMemberDescription{{
			ClientID:    classicGroupID + "-client",
			Assignments: assignment,
		}},
		TopicOffsets: offsets,
	}
	kip848 := ConsumerGroupOverview{
		GroupID:               kip848GroupID,
		GroupType:             GroupTypeConsumer,
		State:                 "Stable",
		ProtocolType:          "consumer",
		Protocol:              "range",
		GroupEpoch:            &epoch,
		TargetAssignmentEpoch: &epoch,
		Members: []GroupMemberDescription{{
			ClientID:          kip848GroupID + "-client",
			Assignments:       assignment,
			MemberEpoch:       &epoch,
			TargetAssignments: assignment,
			SubscribedTopics:  []string{groupTestTopic},
		}},
		TopicOffsets: offsets,
	}
	// The state comes from ListGroups.
	kip848Undescribed := ConsumerGroupOverview{
		GroupID:      kip848GroupID,
		GroupType:    GroupTypeConsumer,
		State:        "Stable",
		ProtocolType: "consumer",
		Members:      []GroupMemberDescription{},
		TopicOffsets: offsets,
	}

	tests := []struct {
		name           string
		groupIDs       []string
		cannotDescribe bool
		want           []ConsumerGroupOverview
		wantStatus     int
	}{
		{name: "all groups", want: []ConsumerGroupOverview{classic, kip848}},
		{name: "one KIP-848 group", groupIDs: []string{kip848GroupID}, want: []ConsumerGroupOverview{kip848}},
		{name: "missing group", groupIDs: []string{"does-not-exist"}, wantStatus: http.StatusNotFound},
		{name: "KIP-848 groups cannot be described", cannotDescribe: true, want: []ConsumerGroupOverview{classic, kip848Undescribed}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
			defer cancel()
			env := newGroupTestEnv(ctx, t)
			env.joinGroup(ctx, t, classicGroupID, false)
			env.joinGroup(ctx, t, kip848GroupID, true)
			if tc.cannotDescribe {
				env.rejectConsumerGroupDescribe(t)
			} else {
				env.nameAssignmentTopics(ctx, t)
			}

			got, restErr := env.svc.GetConsumerGroupsOverview(ctx, tc.groupIDs)
			if tc.wantStatus != 0 {
				require.NotNil(t, restErr)
				assert.Equal(t, tc.wantStatus, restErr.Status)
				return
			}
			require.Nil(t, restErr)
			assert.Equal(t, tc.want, stable(got))
		})
	}
}

func TestListGroups_GroupType(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()
	env := newGroupTestEnv(ctx, t)
	env.joinGroup(ctx, t, kip848GroupID, true)

	tests := []struct {
		name     string
		versions *kversion.Versions
		want     string
	}{
		{name: "ListGroups v5", versions: kversion.Stable(), want: GroupTypeConsumer},
		// Kafka 3.7 serves ListGroups v4 at most, which carries no group type.
		{name: "ListGroups v4", versions: kversion.V3_7_0(), want: GroupTypeClassic},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cl, adminCl := testutil.CreateClients(t, env.cluster.ListenAddrs(), kgo.MaxVersions(tc.versions))
			t.Cleanup(cl.Close)

			listed, err := listGroups(ctx, adminCl)
			require.NoError(t, err)
			assert.Equal(t, kadm.ListedGroups{kip848GroupID: {
				Group:     kip848GroupID,
				GroupType: tc.want,
				State:     "Stable",
			}}, listed)
		})
	}
}

func TestEditConsumerGroupOffsets_KIP848Group(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()
	env := newGroupTestEnv(ctx, t)
	member := env.joinGroup(ctx, t, kip848GroupID, true)

	topics := []kmsg.OffsetCommitRequestTopic{{
		Topic:      groupTestTopic,
		Partitions: []kmsg.OffsetCommitRequestTopicPartition{{Partition: 0, Offset: 0}},
	}}

	res, restErr := env.svc.EditConsumerGroupOffsets(ctx, kip848GroupID, topics)
	require.Nil(t, restErr)
	assert.Contains(t, res.Error, "still active")

	member.Close()
	env.waitForState(ctx, t, kip848GroupID, "Empty")

	res, restErr = env.svc.EditConsumerGroupOffsets(ctx, kip848GroupID, topics)
	require.Nil(t, restErr)
	assert.Equal(t, &EditConsumerGroupOffsetsResponse{
		Topics: []EditConsumerGroupOffsetsResponseTopic{{
			TopicName:  groupTestTopic,
			Partitions: []EditConsumerGroupOffsetsResponseTopicPartition{{ID: 0}},
		}},
	}, res)

	_, restErr = env.svc.EditConsumerGroupOffsets(ctx, "does-not-exist", topics)
	require.NotNil(t, restErr)
	assert.Equal(t, http.StatusNotFound, restErr.Status)
}
