package msgpack

import (
	"fmt"
)

// Config represents the message pack config.
type Config struct {
	Enabled bool `json:"enabled"`

	// TopicNames is a list of topic names that shall be considered for messagepack decoding.
	// These names can be provided as regex string (e. g. "/.*/" or "/prefix-.*/") or as plain topic name
	// such as "frontend-activities".
	// This defaults to `/.*/`
	TopicNames []string `koanf:"topicNames"`
}

// Validate if provided TopicNames are valid.
func (c *Config) Validate() error {
	if !c.Enabled {
		return nil
	}

	if len(c.TopicNames) == 0 {
		return fmt.Errorf("msgpack deserializer is enabled, but no topic names have been configured")
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
