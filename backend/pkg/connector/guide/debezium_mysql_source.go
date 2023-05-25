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
						// No Group name and description here
						ConfigKeys: []string{
							"database.hostname",
							"database.port",
							"database.user",
							"database.password",
							"database.ssl.mode",
							"connect.timeout.ms",
							"connect.keep.alive",
							"connect.keep.alive.interval.ms",
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
							"key.converter.schemas.enable",
							"value.converter",
							"value.converter.schemas.enable",
							"header.converter",

							"database.include.list",
							"database.exclude.list",
							"table.include.list",
							"table.exclude.list",
							"column.include.list",
							"column.exclude.list",
							"column.propagate.source.type",
							"datatype.propagate.source.type",
							"time.precision.mode",
							"decimal.handling.mode",
							"bigint.unsigned.handling.mode",
							"include.schema.changes",
							"include.query",
							"event.deserialization.failure.handling.mode",
							"inconsistent.schema.handling.mode",
							"max.batch.size",
							"max.queue.size",
							"max.queue.size.in.bytes",
							"poll.interval.ms",
							"gtid.source.includes",
							"gtid.source.excludes",
							"tombstones.on.delete",
							"message.key.columns",
							"binary.handling.mode",
							"schema.name.adjustment.mode",

							"database.server.id",
							"schema.history.internal.kafka.topic",
						},
					},
				},
			},

			{
				Name:        "Expert options",
				Description: "The following options list contains expert connector properties. The default values for these properties rarely need to be changed",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{
							"min.row.count.to.stream.results",
							"incremental.snapshot.chunk.size",
							"query.fetch.size",
							"skipped.operations",
							"converters",
							"snapshot.mode",
							"snapshot.delay.ms",
							"snapshot.include.collection.list",
							"snapshot.locking.mode",
							"snapshot.lock.timeout.ms",
							"snapshot.max.threads",
							"retriable.restart.connector.wait.ms",
							"enable.time.adjuster",
							"heartbeat.interval.ms",
							"heartbeat.topics.prefix",
							"signal.data.collection",
							"topic.naming.strategy",
							"snapshot.select.statement.overrides",
							"table.ignore.builtin",
							"binlog.buffer.size",
							"database.initial.statements",
							"event.processing.failure.handling.mode",
							"gtid.source.filter.dml.events",
							"topic.creation.enable",
							"topic.creation.default.partitions",
							"topic.creation.default.replication.factor",
						},
					},
				},
			},

			reviewAndLaunch(),
		},
	}
}
