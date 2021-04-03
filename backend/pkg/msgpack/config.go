package msgpack

import (
	"fmt"
)

// Config represents the message pack config.
type Config struct {
	Enabled bool `yaml:"enabled"`

	// TopicNames is a list of topic names that shall be considered for messagepack decoding.
	// These names can be provided as regex string (e. g. "/.*/" or "/prefix-.*/") or as plain topic name
	// such as "frontend-activities".
	// This defaults to `/.*/`
	TopicNames []string `yaml:"topicNames"`
}

// Validate if provided TopicNames are valid.
func (c *Config) Validate() error {
	if !c.Enabled {
		return nil
	}

	// Check whether each provided string is valid regex
	for _, topic := range c.TopicNames {
		_, err := compileRegex(topic)
		if err != nil {
			return fmt.Errorf("allowed topic string '%v' is not valid regex", topic)
		}
	}

	return nil
}

func (c *Config) SetDefaults() {
	c.TopicNames = []string{"/.*/"}
}
