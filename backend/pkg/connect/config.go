package connect

import "fmt"

type Config struct {
	Enabled  bool            `yaml:"enabled"`
	Clusters []ConfigCluster `yaml:"clusters"`
}

func (c *Config) Validate() error {
	for i, cluster := range c.Clusters {
		err := cluster.Validate()
		if err != nil {
			return fmt.Errorf("failed to validate cluster at index '%d' (name: '%v'): %w", i, cluster.Name, err)
		}
	}
	return nil
}
