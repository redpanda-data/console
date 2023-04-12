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

// NewJdbcSinkGuide returns a new guide for JDBC sinks.
func NewJdbcSinkGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "com.redpanda.kafka.connect.jdbc.JdbcSinkConnector",
		options:   o,
		wizardSteps: []model.ValidationResponseStep{
			{
				Name: "Topics to export",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{"topics", "topics.regex"},
					},
				},
			},

			{
				Name: "Connection",
				Groups: []model.ValidationResponseStepGroup{
					{
						ConfigKeys: []string{
							"connection.url",
							"connection.user",
							"connection.password",
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
							"fields.whitelist",
							"topics.to.tables.mapping",
							"table.name.format",
							"table.name.normalize",
							"sql.quote.identifiers",
							"auto.create",
							"auto.evolve",
							"batch.size",
							"db.timezone",
							"insert.mode",
							"pk.mode",
							"pk.fields",
							"max.retries",
							"retry.backoff.ms",
							"dialect.name",
						},
					},
				},
			},

			sizing(),

			reviewAndLaunch(),
		},
	}
}
