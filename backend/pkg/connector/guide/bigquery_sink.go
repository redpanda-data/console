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

// NewBigQuerySinkGuide returns a new connector guide for BigQuery's sink connector.
func NewBigQuerySinkGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		DefaultGuide: DefaultGuide{
			options: o,
		},
		className: "com.wepay.kafka.connect.bigquery.BigQuerySinkConnector",
		wizardSteps: []model.ValidationResponseStep{
			topicsToExport(),

			{
				Name: "BigQuery Connection",
				Groups: []model.ValidationResponseStepGroup{
					{
						ConfigKeys: []string{
							"keyfile",
							"project",
							"defaultDataset",
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
							"autoCreateTables",
							"topic2TableMap",
							"allowNewBigQueryFields",
							"allowBigQueryRequiredFieldRelaxation",
							"upsertEnabled",
							"deleteEnabled",
							"kafkaKeyFieldName",
							"timePartitioningType",
							"bigQueryRetry",
							"bigQueryRetryWait",
							"errors.tolerance",
						}, dlq()...),
					},
				},
			},

			sizing(),

			reviewAndLaunch(),
		},
	}
}
