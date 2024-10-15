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

// NewDebeziumSQLServerGuide returns a new Guide for Debezium's Microsoft SQL Server source connector.
func NewDebeziumSQLServerGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		DefaultGuide: DefaultGuide{
			options: o,
		},
		className: "io.debezium.connector.sqlserver.SqlServerConnector",
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
							"database.instance",
							"database.names",
							"database.query.timeout.ms",
							"database.encrypt",
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
							"key.converter.serializer.type",
							"key.converter.data.serializer.type",
							"key.converter.json.schemas.enable",
							"value.converter",
							"value.converter.schemas.enable",
							"value.converter.serializer.type",
							"value.converter.data.serializer.type",
							"value.converter.json.schemas.enable",
							"header.converter",

							"include.schema.changes",
							"include.schema.comments",
							"table.include.list",
							"table.exclude.list",
							"column.include.list",
							"column.exclude.list",
							"table.ignore.builtin",

							"topic.creation.groups",
							"transaction.boundary",
							"transaction.boundary.interval.ms",
							"offsets.storage.topic",

							"event.processing.failure.handling.mode",
							"max.batch.size",
							"max.queue.size",
							"max.queue.size.in.bytes",
							"provide.transaction.metadata",
							"skipped.operations",
							"snapshot.delay.ms",
							"streaming.delay.ms",
							"snapshot.include.collection.list",
							"snapshot.fetch.size",
							"snapshot.max.threads",
							"snapshot.mode.custom.name",
							"snapshot.mode.configuration.based.snapshot.data",
							"snapshot.mode.configuration.based.snapshot.schema",
							"snapshot.mode.configuration.based.start.stream",
							"snapshot.mode.configuration.based.snapshot.on.schema.error",
							"snapshot.mode.configuration.based.snapshot.on.data.error",
							"snapshot.fetch.size",
							"incremental.snapshot.watermarking.strategy",
							"internal.log.position.check.enable",
							"decimal.handling.mode",
							"time.precision.mode",
							"snapshot.mode",
							"snapshot.isolation.mode",
							"max.iteration.transactions",
							"binary.handling.mode",
							"schema.name.adjustment.mode",
							"incremental.snapshot.option.recompile",
							"incremental.snapshot.chunk.size",
							"incremental.snapshot.allow.schema.changes",
							"data.query.mode",
							"schema.history.internal",
							"schema.history.internal.skip.unparseable.ddl",
							"schema.history.internal.store.only.captured.tables.ddl",
							"schema.history.internal.store.only.captured.databases.ddl",
							"post.processors",
							"tombstones.on.delete",
							"heartbeat.topics.prefix",
							"signal.data.collection",
							"signal.poll.interval.ms",
							"signal.enabled.channels",
							"topic.naming.strategy",
							"notification.enabled.channels",
							"notification.sink.topic.name",
							"transaction.metadata.factory",

							"message.key.columns",
							"snapshot.select.statement.overrides",

							"column.propagate.source.type",
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
							"custom.metric.tags",
							"internal.snapshot.scan.all.columns.force",
							"retriable.restart.connector.wait.ms",
							"exactly.once.support",
							"datatype.propagate.source.type",

							"snapshot.tables.order.by.row.count",
							"heartbeat.action.query",
							"sourceinfo.struct.maker",
							"converters",
							"heartbeat.interval.ms",
							"snapshot.lock.timeout.ms",
							"poll.interval.ms",
							"errors.max.retries",
						},
					},
				},
			},

			sizing(),

			reviewAndLaunch(),
		},
	}
}
