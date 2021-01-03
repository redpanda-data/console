package owl

import (
	"flag"
	"github.com/cloudhut/kowl/backend/pkg/git"
)

type ConfigTopicDocumentation struct {
	Enabled bool       `yaml:"enabled"`
	Git     git.Config `yaml:"git"`
}

func (c *ConfigTopicDocumentation) RegisterFlags(f *flag.FlagSet) {
	c.Git.RegisterFlags(f)
}

func (c *ConfigTopicDocumentation) Validate() error {
	if !c.Enabled {
		return nil
	}

	return c.Git.Validate()
}

func (c *ConfigTopicDocumentation) SetDefaults() {
	c.Git.SetDefaults()
	c.Git.AllowedFileExtensions = []string{".md"}
}
