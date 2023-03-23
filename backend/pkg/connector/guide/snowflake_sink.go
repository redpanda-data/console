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

// NewSnowflakeSinkGuide returns a new connector guide for Snowflake's sink connector.
func NewSnowflakeSinkGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "com.snowflake.kafka.connector.SnowflakeSinkConnector",
		options:   o,
		wizardSteps: []model.ValidationResponseStep{
			topicsToExport(),

			{
				Name: "Snowflake Connection",
				Groups: []model.ValidationResponseStepGroup{
					{
						ConfigKeys: []string{
							"snowflake.url.name",
							"snowflake.database.name",
							"snowflake.user.name",
							"snowflake.private.key",
							"snowflake.private.key.passphrase",
							"snowflake.role.name",
							"snowflake.schema.name",
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
							"snowflake.ingestion.method",
							"value.converter",
							"snowflake.topic2table.map",
							"buffer.count.records",
							"buffer.flush.time",
							"buffer.size.bytes",
							"errors.tolerance",
						},
					},
				},
			},

			sizing(),

			reviewAndLaunch(),
		},
	}
}
