// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import "flag"

// GitAuthSSH is the configuration to authenticate against Git via SSH.
type GitAuthSSH struct {
	Enabled            bool   `yaml:"enabled"`
	Username           string `yaml:"username"`
	PrivateKey         string `yaml:"privateKey"` // user can either pass the key directly or let RP Console load it from disk
	PrivateKeyFilePath string `yaml:"privateKeyFilepath"`
	Passphrase         string `yaml:"passphrase"`
}

// RegisterFlagsWithPrefix for sensitive SSH configs
func (c *GitAuthSSH) RegisterFlagsWithPrefix(f *flag.FlagSet, prefix string) {
	f.StringVar(&c.PrivateKey, prefix+"git.ssh.private-key", "", "Private key for Git authentication")
	f.StringVar(&c.Passphrase, prefix+"git.ssh.passphrase", "", "Passphrase to decrypt private key")
}
