package connect

type Config struct {
	Enabled  bool            `yaml:"enabled"`
	Clusters []ConfigCluster `yaml:"clusters"`
}

func (c *Config) Validate() error {
	return nil
}
