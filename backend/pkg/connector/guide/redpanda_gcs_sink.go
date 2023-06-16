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

// NewRedpandaGCSSinkGuide returns a new guide for Redpanda's GCS sink connector.
func NewRedpandaGCSSinkGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "com.redpanda.kafka.connect.gcs.GcsSinkConnector",
		options:   o,
		wizardSteps: []model.ValidationResponseStep{
			topicsToExport(),

			{
				Name: "GCS connection",
				Groups: []model.ValidationResponseStepGroup{
					{
						Name:              "Authentication with Google",
						Description:       "A Google service accounts grants programmatic access to GCP resources",
						DocumentationLink: "https://cloud.google.com/iam/docs/keys-create-delete",
						ConfigKeys:        []string{"gcs.credentials.json"},
					},
					{
						Name:       "GCS bucket settings",
						ConfigKeys: []string{"gcs.bucket.name"},
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
							"format.output.type",
							"avro.codec",

							"file.name.template",
							"file.name.prefix",
							"format.output.fields",
							"format.output.fields.value.encoding",
							"format.output.envelope",
							"file.compression.type",
							"file.max.records",
							"file.flush.interval.ms",
							"gcs.bucket.check",
							"gcs.retry.backoff.initial.delay.ms",
							"gcs.retry.backoff.max.delay.ms",
							"gcs.retry.backoff.delay.multiplier",
							"gcs.retry.backoff.max.attempts",
							"gcs.retry.backoff.total.timeout.ms",
							"kafka.retry.backoff.ms",
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
