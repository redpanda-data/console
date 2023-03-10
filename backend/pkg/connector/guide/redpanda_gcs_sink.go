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
				Name: "GCS Connection",
				Groups: []model.ValidationResponseStepGroup{
					{
						Name:              "Authentication with Google",
						Description:       "A Google service accounts grants programmatic access to GCP resources.",
						DocumentationLink: "https://",
						ConfigKeys:        []string{"gcp.credentials.json"},
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
						ConfigKeys: []string{
							"name",
							"key.converter",
							"value.converter",
							"header.converter",
							"format.output.type",
							"file.max.records",
							"file.flush.interval.ms",
							"gcs.bucket.check",
							"file.compression.type",
							"file.name.template",
							"file.name.prefix",
							"format.output.fields",
							"format.output.fields.value.encoding",
							"gcs.retry.backoff.initial.delay.ms",
							"gcs.retry.backoff.max.delay.ms",
							"gcs.retry.backoff.delay.multiplier",
							"gcs.retry.backoff.max.attempts",
							"gcs.retry.backoff.total.timeout.ms",
							"kafka.retry.backoff.ms",
							"errors.tolerance",
						},
					},
				},
			},

			{
				Name: "Sizing",
				Groups: []model.ValidationResponseStepGroup{
					{
						// No Group name and description here
						ConfigKeys: []string{"tasks.max"},
					},
				},
			},
		},
	}
}
