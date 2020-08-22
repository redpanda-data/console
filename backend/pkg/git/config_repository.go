package git

import (
	"fmt"
	"time"
)

type RepositoryConfig struct {
	Enabled         bool          `yaml:"enabled"`
	URL             string        `yaml:"url"`
	Branch          string        `yaml:"branch"`
	RefreshInterval time.Duration `yaml:"refreshInterval"` // TODO: Check time duration parsing
}

// Validate given input for config properties
func (c *RepositoryConfig) Validate() error {
	if !c.Enabled {
		return nil
	}

	if c.URL == "" {
		return fmt.Errorf("you must set a repository url")
	}

	return nil
}

// SetDefaults for repository config
func (c *RepositoryConfig) SetDefaults() {
	c.RefreshInterval = time.Minute
}
