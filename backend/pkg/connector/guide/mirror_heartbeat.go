// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package guide

import "github.com/redpanda-data/console/backend/pkg/connector/model"

// NewMirrorHeartbeatGuide returns a new guide for MirrorHeartbeatConnector.
func NewMirrorHeartbeatGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "org.apache.kafka.connect.mirror.MirrorHeartbeatConnector",
		options:   o,
		wizardSteps: []model.ValidationResponseStep{
			{
				Name: "Connector configuration",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{
							"emit.heartbeats.interval.seconds",
							"source.cluster.alias",
							"target.cluster.alias",
							"heartbeats.topic.replication.factor",
						},
					},
				},
			},

			reviewAndLaunch(),
		},
	}
}
