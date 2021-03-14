package git

import "flag"

type BasicAuthConfig struct {
	Enabled  bool   `koanf:"enabled"`
	Username string `koanf:"username"`
	Password string `koanf:"password"`
}

// RegisterFlagsWithPrefix for sensitive Basic Auth configs
func (c *BasicAuthConfig) RegisterFlagsWithPrefix(f *flag.FlagSet, prefix string) {
	f.StringVar(&c.Password, prefix+"git.basic-auth.password", "", "Basic Auth password")
}
