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

// NewMongoSourceGuide returns a new guide for MongoSourceConnector.
func NewMongoSourceGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		DefaultGuide: DefaultGuide{
			options: o,
		},
		className: "com.mongodb.kafka.connect.MongoSourceConnector",
		wizardSteps: []model.ValidationResponseStep{
			{
				Name: "Topic prefix",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{"topic.prefix"},
					},
				},
			},

			{
				Name: "Connection",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{
							"connection.uri",
							"connection.url",
							"connection.username",
							"connection.password",
							"database",
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
							"output.schema.infer.value",
							"collection",
							"startup.mode",
							"startup.mode.timestamp.start.at.operation.time",
							"startup.mode.copy.existing.namespace.regex",
							"startup.mode.copy.existing.pipeline",
							"pipeline",
							"change.stream.full.document",
							"change.stream.full.document.before.change",
							"publish.full.document.only",
							"publish.full.document.only.tombstone.on.delete",
							"mongo.errors.tolerance",
							"producer.override.max.request.size",
							"heartbeat.interval.ms",
							"heartbeat.topic.name",
							"offset.partition.name",
						},
					},
				},
			},

			reviewAndLaunch(),
		},
	}
}
