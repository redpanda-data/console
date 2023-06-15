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

// sizing returns a sizing wizard step.
func sizing() model.ValidationResponseStep {
	return model.ValidationResponseStep{
		Name: "Sizing",
		Groups: []model.ValidationResponseStepGroup{
			{
				// No Group name and description here
				ConfigKeys: []string{"tasks.max"},
			},
		},
	}
}

// reviewAndLaunch returns a review and launch wizard step.
func reviewAndLaunch() model.ValidationResponseStep {
	return model.ValidationResponseStep{
		Name: "Review and launch",
		Groups: []model.ValidationResponseStepGroup{
			{
				// No Group name and description here
				ConfigKeys: []string{"name"},
			},
		},
	}
}

// topicsToExport returns a topics to export wizard step.
func topicsToExport() model.ValidationResponseStep {
	return model.ValidationResponseStep{
		Name: "Topics to export",
		Groups: []model.ValidationResponseStepGroup{
			{
				// No Group name and description here
				ConfigKeys: []string{"topics", "topics.regex"},
			},
		},
	}
}

// mirrorClusterConnection returns a mirror cluster connection wizard step.
func mirrorClusterConnection() model.ValidationResponseStep {
	return model.ValidationResponseStep{
		Name: "Connection",
		Groups: []model.ValidationResponseStepGroup{
			{
				ConfigKeys: []string{
					"source.cluster.bootstrap.servers",
					"security.protocol",
					"source.cluster.security.protocol",
					"source.cluster.sasl.mechanism",
					"source.cluster.sasl.username",
					"source.cluster.sasl.password",
					"source.cluster.sasl.jaas.config",
					"source.cluster.ssl.truststore.certificates",
					"source.cluster.ssl.keystore.key",
					"source.cluster.ssl.keystore.certificate.chain",
				},
			},
		},
	}
}
