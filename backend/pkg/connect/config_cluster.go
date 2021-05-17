package connect

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
