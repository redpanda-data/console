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

// NewRedpandaAwsS3SinkGuide returns a new guide for Redpanda's AWS S3 sink connector.
func NewRedpandaAwsS3SinkGuide(opts ...Option) Guide {
	var o Options
	for _, opt := range opts {
		opt(&o)
	}

	return &WizardGuide{
		className: "com.redpanda.kafka.connect.s3.S3SinkConnector",
		options:   o,
		wizardSteps: []model.ValidationResponseStep{
			topicsToExport(),

			{
				Name: "S3 Connection",
				Groups: []model.ValidationResponseStepGroup{
					{
						Name:              "Authentication with AWS access keys",
						Description:       "An access key grants programmatic access to AWS resources.",
						DocumentationLink: "https://",
						ConfigKeys:        []string{"aws.access.key.id", "aws.secret.access.key"},
					},
					{
						Name:       "S3 bucket settings",
						ConfigKeys: []string{"aws.s3.bucket.name", "aws.s3.region"},
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
							"format.output.type",

							"file.name.template",
							"file.name.prefix",
							"format.output.fields",
							"format.output.fields.value.encoding",
							"file.compression.type",
							"file.max.records",
							"file.flush.interval.ms",
							"aws.s3.bucket.check",
							"aws.s3.part.size.bytes",
							"aws.s3.backoff.delay.ms",
							"aws.s3.backoff.max.delay.ms",
							"aws.s3.backoff.max.retries",
							"errors.tolerance",
						},
					},
				},
			},

			sizing(),

			reviewAndLaunch(),
		},
	}
}
