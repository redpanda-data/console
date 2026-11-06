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
	"encoding/hex"
	"sort"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// describedConsumerGroup is one group of a ConsumerGroupDescribe (KIP-848) response.
type describedConsumerGroup struct {
	Group           string
	Coordinator     int32
	State           string
	GroupEpoch      int32
	AssignmentEpoch int32
	AssignorName    string
	Members         []kmsg.ConsumerGroupDescribeResponseGroupMember
	Err             error
}

// describeConsumerGroups sends a raw ConsumerGroupDescribe request. kadm.DescribeConsumerGroups
// keys assignments by topic name and drops the topic ID, but a broker is free to send the ID
// alone, so the raw response is kept and names are resolved later.
//
// Errors follow kadm: *kadm.AuthError, or *kadm.ShardErrors together with the groups of the
// shards that succeeded.
func describeConsumerGroups(ctx context.Context, cl *kgo.Client, groups []string) (map[string]describedConsumerGroup, error) {
	req := kmsg.NewPtrConsumerGroupDescribeRequest()
	req.Groups = groups
	shards := cl.RequestSharded(ctx, req)

	se := &kadm.ShardErrors{Name: kmsg.ConsumerGroupDescribe.Name()}
	described := make(map[string]describedConsumerGroup, len(groups))
	for _, shard := range shards {
		if shard.Err != nil {
			se.Errs = append(se.Errs, kadm.ShardError{Req: shard.Req, Err: shard.Err, Broker: shard.Meta})
			continue
		}
		resp := shard.Resp.(*kmsg.ConsumerGroupDescribeResponse)
		for _, g := range resp.Groups {
			switch g.ErrorCode {
			case kerr.ClusterAuthorizationFailed.Code,
				kerr.TopicAuthorizationFailed.Code,
				kerr.GroupAuthorizationFailed.Code:
				return nil, &kadm.AuthError{Err: kerr.ErrorForCode(g.ErrorCode)}
			}
			described[g.Group] = describedConsumerGroup{
				Group:           g.Group,
				Coordinator:     shard.Meta.NodeID,
				State:           g.State,
				GroupEpoch:      g.Epoch,
				AssignmentEpoch: g.AssignmentEpoch,
				AssignorName:    g.AssignorName,
				Members:         g.Members,
				Err:             kerr.ErrorForCode(g.ErrorCode),
			}
		}
	}
	if len(se.Errs) == 0 {
		return described, nil
	}
	se.AllFailed = len(se.Errs) == len(shards)
	return described, se
}

// consumerAssignmentNeedsTopicNames reports whether any assignment of the described groups
// carries a topic ID without a topic name.
func consumerAssignmentNeedsTopicNames(described map[string]describedConsumerGroup) bool {
	for _, g := range described {
		for _, m := range g.Members {
			if hasUnnamedTopic(m.Assignment) || hasUnnamedTopic(m.TargetAssignment) {
				return true
			}
		}
	}
	return false
}

func hasUnnamedTopic(a kmsg.Assignment) bool {
	for _, tp := range a.TopicPartitions {
		if tp.Topic == "" {
			return true
		}
	}
	return false
}

// convertConsumerAssignment names each topic by its ID when the broker sent no name. A topic
// that is gone from the metadata keeps its hex ID, so the row still tells the topics apart.
func convertConsumerAssignment(a kmsg.Assignment, topicNames map[[16]byte]string) []GroupMemberAssignment {
	assignments := make([]GroupMemberAssignment, 0, len(a.TopicPartitions))
	for _, tp := range a.TopicPartitions {
		name := tp.Topic
		if name == "" {
			name = topicNames[tp.TopicID]
		}
		if name == "" {
			name = hex.EncodeToString(tp.TopicID[:])
		}
		partitions := make([]int32, len(tp.Partitions))
		copy(partitions, tp.Partitions)
		sort.Slice(partitions, func(i, j int) bool { return partitions[i] < partitions[j] })
		assignments = append(assignments, GroupMemberAssignment{TopicName: name, PartitionIDs: partitions})
	}
	sort.Slice(assignments, func(i, j int) bool { return assignments[i].TopicName < assignments[j].TopicName })
	return assignments
}
