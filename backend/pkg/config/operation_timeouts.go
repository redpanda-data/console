// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"errors"
	"time"
)

// OperationTimeouts contains timeout configurations for various Kafka operations
// performed by the console service.
type OperationTimeouts struct {
	// ClusterInfo is the timeout applied when fetching broker metadata and log dir
	// information to build the cluster overview. A shorter timeout avoids long
	// response times when a single broker is temporarily unreachable, but may
	// cause incomplete results on slow clusters.
	ClusterInfo time.Duration `yaml:"clusterInfo"`

	// TopicsOverview is the timeout applied when fetching topic metadata and per-topic
	// log dir sizes to build the topics list. A shorter timeout avoids long response
	// times when a single broker is temporarily unreachable, but may cause incomplete
	// results on slow clusters.
	TopicsOverview time.Duration `yaml:"topicsOverview"`
}

// SetDefaults for ConsoleTimeouts.
func (c *OperationTimeouts) SetDefaults() {
	c.ClusterInfo = 6 * time.Second
	c.TopicsOverview = 5 * time.Second
}

// Validate ConsoleTimeouts.
func (c *OperationTimeouts) Validate() error {
	if c.ClusterInfo <= 0 {
		return errors.New("console.operationTimeouts.clusterInfo must be a positive duration")
	}
	if c.TopicsOverview <= 0 {
		return errors.New("console.operationTimeouts.topicsOverview must be a positive duration")
	}
	return nil
}
