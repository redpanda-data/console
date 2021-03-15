package git

import "flag"

type BasicAuthConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

// RegisterFlagsWithPrefix for sensitive Basic Auth configs
func (c *BasicAuthConfig) RegisterFlagsWithPrefix(f *flag.FlagSet, prefix string) {
	f.StringVar(&c.Password, prefix+"git.basic-auth.password", "", "Basic Auth password")
}
