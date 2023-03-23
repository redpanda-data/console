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

// NewDebeziumMySQLGuide returns a new guide for Debezium's MySQL connector.
func NewDebeziumMySQLGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "io.debezium.connector.mysql.MySqlConnector",
		options:   o,
		wizardSteps: []model.ValidationResponseStep{
			{
				Name: "Topics to export",
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
							"database.hostname",
							"database.port",
							"database.user",
							"database.password",
							"database.ssl.mode",
							"connect.timeout.ms",
							"database.allowPublicKeyRetrieval",
							"database.connectionTimeZone",
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

							"database.include.list",
							"database.exclude.list",
							"column.include.list",
							"column.exclude.list",
							"bigint.unsigned.handling.mode",
							"binary.handling.mode",
							"column.propagate.source.type",
							"datatype.propagate.source.type",
							"decimal.handling.mode",
							"event.deserialization.failure.handling.mode",
							"gtid.source.excludes",
							"gtid.source.includes",
							"max.batch.size",
							"max.queue.size",
							"max.queue.size.in.bytes",
							"message.key.columns",
							"poll.interval.ms",
							"schema.name.adjustment.mode",
							"tombstones.on.delete",
							"schema.history.internal.kafka.topic",
							"topic.creation.enable",
							"topic.creation.default.partitions",
							"topic.creation.default.replication.factor",
						},
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
