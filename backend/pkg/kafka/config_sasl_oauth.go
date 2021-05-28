package kafka

import (
	"flag"
	"fmt"
)

// SASLOAuthBearer is the config struct for the SASL OAuthBearer mechanism
type SASLOAuthBearer struct {
	Token string `yaml:"token"`
}

// RegisterFlags registers all sensitive Kerberos settings as flag
func (c *SASLOAuthBearer) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Token, "kafka.sasl.oauth.token", "", "OAuth Bearer Token")
}

func (c *SASLOAuthBearer) Validate() error {
	if c.Token == "" {
		return fmt.Errorf("OAuth Bearer token must be set")
	}

	return nil
}
