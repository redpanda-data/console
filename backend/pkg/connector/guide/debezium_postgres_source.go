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

							"database.exclude.list",
							"database.include.list",
							"table.exclude.list",
							"table.include.list",
							"column.exclude.list",
							"column.include.list",
							"schema.exclude.list",
							"schema.include.list",
							"topic.creation.enable",
							"topic.creation.default.partitions",
							"topic.creation.default.replication.factor",
							"topic.creation.default.cleanup.policy",
							"binary.handling.mode",
							"column.mask.hash.([^.]+).with.salt.(.+)",
							"column.mask.with.(d+).chars",
							"column.propagate.source.type",
							"column.truncate.to.(d+).chars",
							"config.action.reload",
							"converters",
							"database.initial.statements",
							"database.ssl.mode",
							"database.sslfactory",
							"database.tcpKeepAlive",
							"datatype.propagate.source.type",
							"decimal.handling.mode",
							"event.processing.failure.handling.mode",
							"exactly.once.support",
							"flush.lsn.source",
							"heartbeat.action.query",
							"heartbeat.interval.ms",
							"heartbeat.topics.prefix",
							"hstore.handling.mode",
							"include.schema.comments",
							"include.unknown.datatypes",
							"incremental.snapshot.chunk.size",
							"internal.snapshot.scan.all.columns.force",
							"interval.handling.mode",
							"max.batch.size",
							"max.queue.size",
							"max.queue.size.in.bytes",
							"message.key.columns",
							"message.prefix.exclude.list",
							"message.prefix.include.list",
							"offsets.storage.topic",
							"plugin.name - set to ‘pgoutput’ by default",
							"poll.interval.ms",
							"provide.transaction.metadata",
							"publication.autocreate.mode",
							"publication.name",
							"query.fetch.size",
							"retriable.restart.connector.wait.ms",
							"sanitize.field.names",
							"schema.name.adjustment.mode",
							"schema.refresh.mode",
							"signal.data.collection",
							"skipped.operations",
							"slot.drop.on.stop",
							"slot.max.retries",
							"slot.name",
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
							"time.precision.mode",
							"tombstones.on.delete",
							"topic.creation.groups",
							"topic.naming.strategy",
							"transaction.boundary",
							"transaction.boundary.interval.ms",
							"unavailable.value.placeholder",
							"xmin.fetch.interval.ms",
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
