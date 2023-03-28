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

// NewJDBCSourceGuide returns a new guide for JDBC sources.
func NewJDBCSourceGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "com.redpanda.kafka.connect.jdbc.JdbcSourceConnector",
		options:   o,
		wizardSteps: []model.ValidationResponseStep{
			{
				Name: "Topics to import",
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
						ConfigKeys: []string{
							"connection.url",
							"connection.user",
							"connection.password",
							"connection.attempts",
							"connection.backoff.ms",
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

							"table.whitelist",
							"table.blacklist",
							"db.timezone",
							"batch.max.rows",
							"catalog.pattern",
							"incrementing.column.name",
							"incrementing.initial",
							"mode",
							"numeric.mapping",
							"poll.interval.ms",
							"query",
							"schema.pattern",
							"sql.quote.identifiers",
							"table.poll.interval.ms",
							"table.types",
							"timestamp.column.name",
							"timestamp.delay.interval.ms",
							"timestamp.initial.ms",
							"validate.non.null",
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
