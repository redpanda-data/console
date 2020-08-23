package git

import "flag"

type SSHConfig struct {
	Enabled            bool   `yaml:"enabled"`
	Username           string `yaml:"username"`
	PrivateKey         string `yaml:"privateKey"` // user can either pass the key directly or let Kowl load it from disk
	PrivateKeyFilePath string `yaml:"privateKeyFilepath"`
	Passphrase         string `yaml:"passphrase"`
}

// RegisterFlags for sensitive SSH configs
func (c *SSHConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.PrivateKey, "git.ssh.private-key", "", "Private key for Git authentication")
	f.StringVar(&c.Passphrase, "git.ssh.passphrase", "", "Passphrase to decrypt private key")
}
