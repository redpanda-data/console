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

// NewMirrorSourceGuide returns a new guide for MirrorSourceConnector sources.
func NewMirrorSourceGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "org.apache.kafka.connect.mirror.MirrorSourceConnector",
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

			{
				Name: "Connection",
				Groups: []model.ValidationResponseStepGroup{
					{
						ConfigKeys: []string{
							"source.cluster.bootstrap.servers",
							"security.protocol",
							"source.cluster.security.protocol",
							"source.cluster.sasl.mechanism",
							"source.cluster.sasl.username",
							"source.cluster.sasl.password",
							"source.cluster.ssl.truststore.certificates",
							"source.cluster.ssl.keystore.key",
							"source.cluster.ssl.keystore.certificate.chain",
						},
					},
				},
			},

			{
				Name: "Connector configuration",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{
							"source.cluster.alias",
							"replication.policy.class",
							"topics.exclude",
							"replication.factor",
							"refresh.topics.interval.seconds",
							"sync.topic.configs.enabled",
							"sync.topic.configs.interval.seconds",
							"sync.topic.acls.enabled",
							"sync.topic.acls.interval.seconds",
							"offset-syncs.topic.location",
							"offset-syncs.topic.replication.factor",
							"config.properties.exclude",
							"producer.override.compression.type",
						},
					},
				},
			},

			reviewAndLaunch(),
		},
	}
}
