package git

import "flag"

type SSHConfig struct {
	Enabled            bool   `yaml:"enabled"`
	Username           string `yaml:"username"`
	PrivateKey         string `yaml:"privateKey"` // user can either pass the key directly or let Kowl load it from disk
	PrivateKeyFilePath string `yaml:"privateKeyFilepath"`
	Passphrase         string `yaml:"passphrase"`
}

// RegisterFlagsWithPrefix for sensitive SSH configs
func (c *SSHConfig) RegisterFlagsWithPrefix(f *flag.FlagSet, prefix string) {
	f.StringVar(&c.PrivateKey, prefix+"git.ssh.private-key", "", "Private key for Git authentication")
	f.StringVar(&c.Passphrase, prefix+"git.ssh.passphrase", "", "Passphrase to decrypt private key")
}
