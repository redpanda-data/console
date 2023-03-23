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

// NewJDBCSinkGuide returns a new guide for JDBC sinks.
func NewJDBCSinkGuide(opts ...Option) Guide {
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
							"auto.create",
							"auto.evolve",
							"batch.size",
							"db.timezone",
							"dialect.name",
							"fields.whitelist",
							"insert.mode",
							"max.retries",
							"pk.fields",
							"pk.mode",
							"retry.backoff.ms",
							"sql.quote.identifiers",
							"table.name.format",
							"table.name.normalize",
							"topics.to.tables.mapping",
						},
					},
				},
			},

			{
				Name: "Sizing",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{"tasks.max"},
					},
				},
			},

			{
				Name: "Review and launch",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{"name"},
					},
				},
			},
		},
	}
}
