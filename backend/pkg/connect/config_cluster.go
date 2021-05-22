package connect

import "fmt"

type ConfigCluster struct {
	// Name will be shown in the Frontend to identify a connect cluster
	Name string `yaml:"name"`
	// URL is the HTTP address that will be set as base url for all requests
	URL string `yaml:"url"`

	// Authentication configuration
	//
	TLS      ConfigClusterTLS `yaml:"tls"`
	Username string           `yaml:"username"`
	Password string           `yaml:"password"`
	Token    string           `yaml:"token"`
}

func (c *ConfigCluster) Validate() error {
	if c.Name == "" {
		return fmt.Errorf("a cluster name must be set to identify the connect cluster")
	}

	if c.URL == "" {
		return fmt.Errorf("url to access the Connect cluster API must be set")
	}

	err := c.TLS.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate TLS config: %w", err)
	}

	return nil
}
