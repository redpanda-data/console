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

// NewMongoSinkGuide returns a new guide for MongoSinkConnector.
func NewMongoSinkGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "com.mongodb.kafka.connect.MongoSinkConnector",
		options:   o,
		wizardSteps: []model.ValidationResponseStep{
			topicsToExport(),

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
							"collection",

							"change.data.capture.handler",

							"key.projection.type",
							"key.projection.list",
							"value.projection.type",
							"value.projection.list",

							"field.renamer.mapping",

							"timeseries.timefield",
							"timeseries.metafield",
							"timeseries.timefield.auto.convert",
							"timeseries.timefield.auto.convert.date.format",
							"timeseries.expire.after.seconds",
							"timeseries.granularity",

							"mongo.errors.tolerance",
						},
					},
				},
			},

			sizing(),

			reviewAndLaunch(),
		},
	}
}
