package owl

import (
	"flag"
	"fmt"
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
	if c.Enabled && !c.Git.Enabled {
		return fmt.Errorf("topic documentation is enabled, but git service is diabled. At least one source for topic documentations must be configured")
	}

	return c.Git.Validate()
}

func (c *ConfigTopicDocumentation) SetDefaults() {
	c.Git.SetDefaults()
	c.Git.AllowedFileExtensions = []string{".md"}
}
