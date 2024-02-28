// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import "fmt"

// RestSerde represents the REST config.
type RestSerde struct {
	Enabled bool        `yaml:"enabled"`
	Topics  []RestTopic `yaml:"topics"`
}

// REST represents the REST config.
type RestTopic struct {
	Name string `yaml:"name"`
	Url  string `yaml:"url"`
}

// Validate if provided TopicNames are valid.
func (c *RestSerde) Validate() error {
	if !c.Enabled {
		return nil
	}

	// Check whether each provided string is valid regex
	for _, topic := range c.Topics {
		_, err := CompileRegex(topic.Name)
		if err != nil {
			return fmt.Errorf("allowed topic string '%v' is not valid regex", topic)
		}
	}

	return nil
}

// SetDefaults for the REST configuration.
func (c *RestSerde) SetDefaults() {
	c.Enabled = false
}
