package kafka

import (
	"flag"
)

// SASLGSSAPIConfig represents the Kafka Kerberos config
type SASLGSSAPIConfig struct {
	AuthType           string `koanf:"authType"`
	KeyTabPath         string `koanf:"keyTabPath"`
	KerberosConfigPath string `koanf:"kerberosConfigPath"`
	ServiceName        string `koanf:"serviceName"`
	Username           string `koanf:"username"`
	Password           string `koanf:"password"`
	Realm              string `koanf:"realm"`
}

// RegisterFlags registers all sensitive Kerberos settings as flag
func (c *SASLGSSAPIConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Password, "kafka.sasl.gssapi.password", "", "Kerberos password if auth type user auth is used")
}
