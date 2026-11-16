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
)

const (
	// GroupTypeClassic is a group that uses the classic, client-driven rebalance protocol.
	GroupTypeClassic = "classic"
	// GroupTypeConsumer is a KIP-848 group, whose broker computes the partition assignment.
	GroupTypeConsumer = "consumer"
)

// listGroups lists all groups. A broker below ListGroups v5 reports no group type; such a
// broker cannot host KIP-848 groups, so its groups are classic.
//
// Errors follow kadm.ListGroups: *kadm.AuthError, or *kadm.ShardErrors together with the
// groups of the shards that succeeded.
func listGroups(ctx context.Context, adminCl *kadm.Client) (kadm.ListedGroups, error) {
	listed, err := adminCl.ListGroups(ctx)
	for name, g := range listed {
		if g.GroupType == "" {
			g.GroupType = GroupTypeClassic
			listed[name] = g
		}
	}
	return listed, err
}
