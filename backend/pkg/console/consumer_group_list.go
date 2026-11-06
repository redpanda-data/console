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

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

const (
	// GroupTypeClassic is a group that uses the classic, client-driven rebalance protocol.
	GroupTypeClassic = "classic"
	// GroupTypeConsumer is a KIP-848 group, whose broker computes the partition assignment.
	GroupTypeConsumer = "consumer"
)

// listedGroup is one group of a ListGroups response, merged across all brokers.
type listedGroup struct {
	Group       string
	State       string
	Type        string
	Coordinator int32
}

// listGroups sends a raw ListGroups request so that the group type of ListGroups v5
// is available. kadm.ListedGroup drops it. A broker below v5 reports no type; such a
// broker cannot host KIP-848 groups, so its groups are classic.
//
// Errors follow kadm.ListGroups: *kadm.AuthError, or *kadm.ShardErrors together with
// the groups of the shards that succeeded.
func listGroups(ctx context.Context, cl *kgo.Client) (map[string]listedGroup, error) {
	req := kmsg.NewPtrListGroupsRequest()
	shards := cl.RequestSharded(ctx, req)

	se := &kadm.ShardErrors{Name: kmsg.ListGroups.Name()}
	groups := make(map[string]listedGroup)
	for _, shard := range shards {
		err := shard.Err
		if err == nil {
			resp := shard.Resp.(*kmsg.ListGroupsResponse)
			switch resp.ErrorCode {
			case 0:
				for _, g := range resp.Groups {
					typ := GroupTypeClassic
					if resp.Version >= 5 && g.GroupType != "" {
						typ = g.GroupType
					}
					groups[g.Group] = listedGroup{
						Group:       g.Group,
						State:       g.GroupState,
						Type:        typ,
						Coordinator: shard.Meta.NodeID,
					}
				}
				continue
			case kerr.ClusterAuthorizationFailed.Code,
				kerr.TopicAuthorizationFailed.Code,
				kerr.GroupAuthorizationFailed.Code,
				kerr.TransactionalIDAuthorizationFailed.Code,
				kerr.DelegationTokenAuthorizationFailed.Code:
				return nil, &kadm.AuthError{Err: kerr.ErrorForCode(resp.ErrorCode)}
			}
			err = kerr.ErrorForCode(resp.ErrorCode)
		}
		se.Errs = append(se.Errs, kadm.ShardError{Req: shard.Req, Err: err, Broker: shard.Meta})
	}
	if len(se.Errs) == 0 {
		return groups, nil
	}
	se.AllFailed = len(se.Errs) == len(shards)
	return groups, se
}
