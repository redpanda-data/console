// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package guide

import (
	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

// NewHTTPSourceGuide returns a new guide for Http sources.
func NewHTTPSourceGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		DefaultGuide: DefaultGuide{
			options: o,
		},
		className: "com.github.castorm.kafka.connect.http.HttpSourceConnector",
		wizardSteps: []model.ValidationResponseStep{
			{
				Name: "Topics to import",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{"kafka.topic"},
					},
				},
			},

			{
				Name: "Connection",
				Groups: []model.ValidationResponseStepGroup{
					{
						ConfigKeys: []string{
							"http.request.url",
							"http.request.params",
							"http.request.method",
							"http.auth.type",
							"http.auth.user",
							"http.auth.password",
							"http.request.body",
							"http.request.headers",
							"http.client.connection.timeout.millis",
							"http.client.connection.ttl.millis",
							"http.client.read.timeout.millis",
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
							"key.converter",
							"key.converter.schemas.enable",
							"value.converter",
							"value.converter.schemas.enable",
							"header.converter",

							"http.offset.initial",
							"http.response.list.pointer",
							"http.response.record.offset.pointer",
							"http.timer.catchup.interval.millis",
							"http.timer.interval.millis",
							"http.timer",
							"http.response.policy.codes.process",
							"http.response.policy.codes.skip",
							"http.response.list.order.direction",
							"http.response.parser",
							"http.response.record.mapper",
							"http.response.record.timestamp.parser",
							"http.response.record.timestamp.parser.pattern",
							"http.response.record.timestamp.parser.regex",
							"http.response.record.timestamp.parser.zone",
							"topic.creation.enable",
							"topic.creation.default.partitions",
							"topic.creation.default.replication.factor",
						},
					},
				},
			},

			sizing(),

			reviewAndLaunch(),
		},
	}
}
