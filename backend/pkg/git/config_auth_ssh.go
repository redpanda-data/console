package git

import "flag"

type SSHConfig struct {
	Enabled            bool   `koanf:"enabled"`
	Username           string `koanf:"username"`
	PrivateKey         string `koanf:"privateKey"` // user can either pass the key directly or let Kowl load it from disk
	PrivateKeyFilePath string `koanf:"privateKeyFilepath"`
	Passphrase         string `koanf:"passphrase"`
}

// RegisterFlagsWithPrefix for sensitive SSH configs
func (c *SSHConfig) RegisterFlagsWithPrefix(f *flag.FlagSet, prefix string) {
	f.StringVar(&c.PrivateKey, prefix+"git.ssh.private-key", "", "Private key for Git authentication")
	f.StringVar(&c.Passphrase, prefix+"git.ssh.passphrase", "", "Passphrase to decrypt private key")
}
