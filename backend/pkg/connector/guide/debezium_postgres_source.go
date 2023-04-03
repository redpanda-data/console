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
							"plugin.name",
							"database.tcpKeepAlive",
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

							"schema.include.list",
							"schema.exclude.list",
							tableIncludeList,
							"table.exclude.list",
							"column.include.list",
							"column.exclude.list",
							"message.key.columns",
							"slot.name",
							"slot.drop.on.stop",
							"publication.name",
							"time.precision.mode",
							"hstore.handling.mode",
							"interval.handling.mode",
							"tombstones.on.delete",
							"column.propagate.source.type",
							"datatype.propagate.source.type",
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
						},
					},
				},
			},

			{
				Name:        "Advanced connector configuration",
				Description: "The following options list contains advanced connector properties. The default values for these properties rarely need to be changed.",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{
							"converters",
							"database.initial.statements",
							"event.processing.failure.handling.mode",
							"flush.lsn.source",
							"heartbeat.action.query",
							"heartbeat.interval.ms",
							"heartbeat.topics.prefix",
							"status.update.interval.ms",
							"include.unknown.datatypes",
							"incremental.snapshot.chunk.size",
							"offsets.storage.topic",
							"poll.interval.ms",
							"query.fetch.size",
							"retriable.restart.connector.wait.ms",
							"schema.refresh.mode",
							"signal.data.collection",
							"skipped.operations",
							"slot.max.retries",
							"slot.retry.delay.ms",
							"slot.stream.params",
							"snapshot.delay.ms",
							"snapshot.fetch.size",
							"snapshot.include.collection.list",
							"snapshot.lock.timeout.ms",
							"snapshot.max.threads",
							"snapshot.mode",
							"snapshot.custom.class",
							"snapshot.select.statement.overrides",
							"topic.creation.groups",
							"topic.naming.strategy",
							"unavailable.value.placeholder",
							"xmin.fetch.interval.ms",
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
