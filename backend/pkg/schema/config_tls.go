package schema

import "flag"

// TLSConfig to connect to Schema via TLS
type TLSConfig struct {
	Enabled               bool   `yaml:"enabled"`
	CaFilepath            string `yaml:"caFilepath"`
	CertFilepath          string `yaml:"certFilepath"`
	KeyFilepath           string `yaml:"keyFilepath"`
	Passphrase            string `yaml:"passphrase"`
	InsecureSkipTLSVerify bool   `yaml:"insecureSkipTlsVerify"`
}

// RegisterFlags for all sensitive Schema TLS configs
func (c *TLSConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Passphrase, "kafka.schemaRegistry.tls.passphrase", "", "Passphrase to optionally decrypt the private key")
}
