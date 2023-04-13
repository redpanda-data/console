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

// NewMirrorCheckpointGuide returns a new guide for MirrorCheckpointConnector.
func NewMirrorCheckpointGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "org.apache.kafka.connect.mirror.MirrorCheckpointConnector",
		options:   o,
		wizardSteps: []model.ValidationResponseStep{
			{
				Name: "Regexes of topics to import",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{"topics"},
					},
				},
			},

			mirrorClusterConnection(),

			{
				Name: "Connector configuration",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{
							"groups",
							"topics.exclude",
							"source.cluster.alias",
							"replication.policy.class",
							"emit.checkpoints.interval.seconds",
							"sync.group.offsets.enabled",
							"sync.group.offsets.interval.seconds",
							"refresh.groups.interval.seconds",
							"offset-syncs.topic.location",
							"checkpoints.topic.replication.factor",
						},
					},
				},
			},

			reviewAndLaunch(),
		},
	}
}
