package owl

import (
	"flag"
	"fmt"
)

type Config struct {
	TopicDocumentation ConfigTopicDocumentation `koanf:"topicDocumentation"`
}

func (c *Config) SetDefaults() {
	c.TopicDocumentation.SetDefaults()
}

func (c *Config) RegisterFlags(f *flag.FlagSet) {
	c.TopicDocumentation.RegisterFlags(f)
}

func (c *Config) Validate() error {
	err := c.TopicDocumentation.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate topic documentation config: %w", err)
	}

	return nil
}
