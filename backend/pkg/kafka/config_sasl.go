package kafka

import (
	"flag"
	"fmt"
	"github.com/Shopify/sarama"
)

type SASLConfig struct {
	Enabled      bool             `yaml:"enabled"`
	UseHandshake bool             `yaml:"useHandshake"`
	Username     string           `yaml:"username"`
	Password     string           `yaml:"password"`
	Mechanism    string           `yaml:"mechanism"`
	GSSAPIConfig SASLGSSAPIConfig `yaml:"gssapi"`
}

func (c *SASLConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Password, "kafka.sasl.password", "", "SASL password")
	c.GSSAPIConfig.RegisterFlags(f)
}

func (c *SASLConfig) SetDefaults() {
	c.UseHandshake = true
	c.Mechanism = sarama.SASLTypePlaintext
}

func (c *SASLConfig) Validate() error {
	switch c.Mechanism {
	case sarama.SASLTypePlaintext, sarama.SASLTypeSCRAMSHA256, sarama.SASLTypeSCRAMSHA512, sarama.SASLTypeGSSAPI:
		// Valid and supported
	case sarama.SASLTypeOAuth:
		return fmt.Errorf("sasl mechanism '%v' is valid but not yet supported. Please submit an issue if you need it.")
	default:
		return fmt.Errorf("given sasl mechanism '%v' is invalid", c.Mechanism)
	}

	return nil
}
