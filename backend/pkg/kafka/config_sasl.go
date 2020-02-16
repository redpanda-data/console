package kafka

import "flag"

type SASLConfig struct {
	Enabled      bool   `yaml:"enabled"`
	UseHandshake bool   `yaml:"useHandshake"`
	Username     string `yaml:"username"`
	Password     string `yaml:"password"`
}

func (c *SASLConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Password, "kafka.sasl.password", "", "SASL password")
}
