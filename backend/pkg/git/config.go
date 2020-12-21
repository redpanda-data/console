package git

import (
	"flag"
)

// Config for Git Service
type Config struct {
	// Repository that contains markdown files that document a Kafka topic.
	TopicDocumentationRepo RepositoryConfig `yaml:"topicDocumentation"`

	// Repository that contains all .proto files that can be used for deserializing Kafka messages.
	ProtobufRepo RepositoryConfig `yaml:"protobuf"`

	// Authentication Configs
	BasicAuth BasicAuthConfig `yaml:"basicAuth"`
	SSH       SSHConfig       `yaml:"ssh"`
}

// RegisterFlags for all (sub)configs
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	c.BasicAuth.RegisterFlags(f)
	c.SSH.RegisterFlags(f)
}

// Validate all root and child config structs
func (c *Config) Validate() error {
	c.TopicDocumentationRepo.Validate()
	c.ProtobufRepo.Validate()
	return nil
}

// SetDefaults for all root and child config structs
func (c *Config) SetDefaults() {
	c.TopicDocumentationRepo.SetDefaults()
	c.ProtobufRepo.SetDefaults()
}
