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

// NewDebeziumPostgresGuide returns a new Guide for Debezium's Postgres source connector.
func NewDebeziumPostgresGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "io.debezium.connector.postgresql.PostgresConnector",
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
							"database.dbname",
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

							"schema.include.list",
							"schema.exclude.list",
							"database.include.list",
							"database.exclude.list",
							"table.include.list",
							"table.exclude.list",
							"column.include.list",
							"column.exclude.list",
							"plugin.name",
							"slot.name",
							"slot.drop.on.stop",
							"time.precision.mode",
							"hstore.handling.mode",
							"database.sslfactory",
							"interval.handling.mode",
							"database.ssl.mode",
							"database.tcpKeepAlive",
							"tombstones.on.delete",
							"column.propagate.source.type",
							"datatype.propagate.source.type",
							"message.key.columns",
							"publication.name",
							"publication.autocreate.mode",
							"binary.handling.mode",
							"schema.name.adjustment.mode",
							"decimal.handling.mode",
							"money.fraction.digits",
							"message.prefix.include.list",
							"message.prefix.exclude.list",
							"max.batch.size",
							"max.queue.size",
							"max.queue.size.in.bytes",

							"converters",
							"database.initial.statements",
							"event.processing.failure.handling.mode",
							"flush.lsn.source",
							"heartbeat.action.query",
							"heartbeat.interval.ms",
							"heartbeat.topics.prefix",
							"include.schema.comments",
							"include.unknown.datatypes",
							"incremental.snapshot.chunk.size",
							"internal.snapshot.scan.all.columns.force",
							"offsets.storage.topic",
							"poll.interval.ms",
							"provide.transaction.metadata",
							"query.fetch.size",
							"retriable.restart.connector.wait.ms",
							"sanitize.field.names",
							"schema.refresh.mode",
							"signal.data.collection",
							"skipped.operations",
							"slot.max.retries",
							"slot.retry.delay.ms",
							"slot.stream.params",
							"snapshot.custom.class",
							"snapshot.delay.ms",
							"snapshot.fetch.size",
							"snapshot.include.collection.list",
							"snapshot.lock.timeout.ms",
							"snapshot.max.threads",
							"snapshot.mode",
							"snapshot.select.statement.overrides",
							"status.update.interval.ms",
							"table.ignore.builtin",
							"topic.creation.groups",
							"topic.naming.strategy",
							"unavailable.value.placeholder",
							"xmin.fetch.interval.ms",
							"topic.creation.enable",
							"topic.creation.default.partitions",
							"topic.creation.default.replication.factor",
							"topic.creation.default.cleanup.policy",
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
