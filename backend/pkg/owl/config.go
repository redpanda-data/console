package owl

import "flag"

type Config struct {
	TopicDocumentation ConfigTopicDocumentation `yaml:"topicDocumentation"`
}

func (c *Config) SetDefaults() {
	c.TopicDocumentation.SetDefaults()
}

func (c *Config) RegisterFlags(f *flag.FlagSet) {
	c.TopicDocumentation.RegisterFlags(f)
}

func (c *Config) Validate() error {
	return c.TopicDocumentation.Validate()
}
