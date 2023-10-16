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

// NewIcebergSinkGuide returns a new guide for Iceberg sink connector.
func NewIcebergSinkGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		DefaultGuide: DefaultGuide{
			options: o,
		},
		className: "io.tabular.iceberg.connect.IcebergSinkConnector",
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
							"iceberg.catalog.type",
							"iceberg.catalog.uri",
							"iceberg.catalog.s3.access-key-id",
							"iceberg.catalog.s3.secret-access-key",
							"iceberg.catalog.client.region",
							"iceberg.catalog.s3.path-style-access",
							"iceberg.catalog.s3.endpoint",
						},
					},
				},
			},

			{
				Name: "Connector configuration",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: append([]string{
							"key.converter",
							"key.converter.schemas.enable",
							"value.converter",
							"value.converter.schemas.enable",
							"header.converter",
							"iceberg.control.topic",
							"iceberg.control.group-id",
							"iceberg.catalog",
							"iceberg.control.commit.interval-ms",
							"iceberg.control.commit.threads",
							"iceberg.control.commit.timeout-ms",
							"iceberg.tables",
							"iceberg.tables.cdc-field",
							"iceberg.tables.dynamic-enabled",
							"iceberg.tables.route-field",
							"iceberg.tables.upsert-mode-enabled",
							"iceberg.tables.evolve-schema-enabled",
							"iceberg.tables.auto-create-enabled",
							"iceberg.tables.default-commit-branch",
							"consumer.override.auto.offset.reset",
						}, dlq()...),
					},
				},
			},

			sizing(),

			reviewAndLaunch(),
		},
	}
}
