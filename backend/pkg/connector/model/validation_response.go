// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package model

// ValidationResponse is the response that will be sent to the Console frontend when
// validating Kafka connectors.
type ValidationResponse struct {
	Name    string                   `json:"name"`
	Configs []ConfigDefinition       `json:"configs"`
	Steps   []ValidationResponseStep `json:"steps"`
}

// ValidationResponseStep represents a section or wizard step in the frontend. It represents a subset
// of configurations that are grouped together.
type ValidationResponseStep struct {
	Name        string                        `json:"name,omitempty"`
	Description string                        `json:"description,omitempty"`
	Groups      []ValidationResponseStepGroup `json:"groups"`
}

// ValidationResponseStepGroup is a group of configurations that belong together. It's the second-level
// hierarchy grouping below a ValidationResponseStep.
type ValidationResponseStepGroup struct {
	Name              string   `json:"name,omitempty"`
	Description       string   `json:"description,omitempty"`
	DocumentationLink string   `json:"documentation_link,omitempty"`
	ConfigKeys        []string `json:"config_keys"`
}
