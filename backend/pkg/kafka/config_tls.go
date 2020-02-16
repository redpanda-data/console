package kafka

import "flag"

type TLSConfig struct {
	Enabled               bool   `yaml:"enabled"`
	CaFilepath            string `yaml:"caFilepath"`
	CertFilepath          string `yaml:"certFilepath"`
	KeyFilepath           string `yaml:"keyFilepath"`
	Passphrase            string `yaml:"passphrase"`
	InsecureSkipTLSVerify bool   `yaml:"insecureSkipTlsVerify"`
}

func (c *TLSConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Passphrase, "kafka.tls.passphrase", "", "Passphrase to optionally decrypt the private key")
}
