package git

import "flag"

type BasicAuthConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

// RegisterFlags for sensitive Basic Auth configs
func (c *BasicAuthConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Password, "git.basic-auth.password", "", "Basic Auth password")
}
