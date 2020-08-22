package git

import (
	"flag"
)

// Config for Git Service
type Config struct {
	// There might come more repositories (e. g. protobuf?) which we want to serve
	TopicDocumentationRepo RepositoryConfig `yaml:"topicDocumentationRepository"`

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
	return nil
}

// SetDefaults for all root and child config structs
func (c *Config) SetDefaults() {
	c.TopicDocumentationRepo.SetDefaults()
}
