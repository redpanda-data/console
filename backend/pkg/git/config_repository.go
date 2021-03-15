package git

import (
	"fmt"
)

type RepositoryConfig struct {
	URL    string `yaml:"url"`
	Branch string `yaml:"branch"`
}

// Validate given input for config properties
func (c *RepositoryConfig) Validate() error {
	if c.URL == "" {
		return fmt.Errorf("you must set a repository url")
	}

	return nil
}
