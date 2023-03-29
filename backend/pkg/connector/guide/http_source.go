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

// NewHttpSourceGuide returns a new guide for Http sources.
func NewHttpSourceGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "com.github.castorm.kafka.connect.http.HttpSourceConnector",
		options:   o,
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
							"http.request.body",
							"http.request.headers",
							"http.auth.type",
							"http.auth.user",
							"http.auth.password",
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
							"value.converter",
							"header.converter",

							"http.offset.initial",
							"http.response.list.pointer",
							"http.response.record.offset.pointer",
							"http.timer.catchup.interval.millis",
							"http.timer.interval.millis",
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
