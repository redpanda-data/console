package kafka

import (
	"flag"
	"fmt"
)

// SASLGSSAPIConfig represents the Kafka Kerberos config
type SASLGSSAPIConfig struct {
	AuthType           string `yaml:"authType"`
	KeyTabPath         string `yaml:"keyTabPath"`
	KerberosConfigPath string `yaml:"kerberosConfigPath"`
	ServiceName        string `yaml:"serviceName"`
	Username           string `yaml:"username"`
	Password           string `yaml:"password"`
	Realm              string `yaml:"realm"`
}

// RegisterFlags registers all sensitive Kerberos settings as flag
func (c *SASLGSSAPIConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Password, "kafka.sasl.gssapi.password", "", "Kerberos password if auth type user auth is used")
}

func (c *SASLGSSAPIConfig) Validate() error {
	if c.AuthType != "USER_AUTH" && c.AuthType != "KEYTAB_AUTH" {
		return fmt.Errorf("auth type '%v' is invalid", c.AuthType)
	}

	return nil
}
