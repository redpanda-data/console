package kafka

import "flag"

// TLSConfig to connect to Kafka via TLS
type TLSConfig struct {
	Enabled               bool   `koanf:"enabled"`
	CaFilepath            string `koanf:"caFilepath"`
	CertFilepath          string `koanf:"certFilepath"`
	KeyFilepath           string `koanf:"keyFilepath"`
	Passphrase            string `koanf:"passphrase"`
	InsecureSkipTLSVerify bool   `koanf:"insecureSkipTlsVerify"`
}

// RegisterFlags for all sensitive Kafka TLS configs
func (c *TLSConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Passphrase, "kafka.tls.passphrase", "", "Passphrase to optionally decrypt the private key")
}
