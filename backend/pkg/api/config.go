// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/cloudhut/common/flagext"
	"github.com/knadh/koanf"
	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/confmap"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
	"github.com/mitchellh/mapstructure"
	"github.com/redpanda-data/console/backend/pkg/connect"
	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
	"go.uber.org/zap"

	"github.com/cloudhut/common/logging"
	"github.com/cloudhut/common/rest"
	"github.com/redpanda-data/console/backend/pkg/kafka"
)

// Config holds all (subdependency)Configs needed to run the API
type Config struct {
	ConfigFilepath   string
	MetricsNamespace string `yaml:"metricsNamespace"`
	ServeFrontend    bool   `yaml:"serveFrontend"` // useful for local development where we want the frontend from 'npm run start'

	Console  console.Config  `yaml:"console"`
	Redpanda redpanda.Config `yaml:"redpanda"`
	Connect  connect.Config  `yaml:"connect"`
	REST     rest.Config     `yaml:"server"`
	Kafka    kafka.Config    `yaml:"kafka"`
	Logger   logging.Config  `yaml:"logger"`
}

// RegisterFlags for all (sub)configs
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.ConfigFilepath, "config.filepath", "", "Path to the config file")

	// Package flags for sensitive input like passwords
	c.Kafka.RegisterFlags(f)
	c.Console.RegisterFlags(f)
	c.Connect.RegisterFlags(f)
}

// Validate all root and child config structs
func (c *Config) Validate() error {
	err := c.Logger.Set(c.Logger.LogLevelInput) // Parses LogLevel
	if err != nil {
		return fmt.Errorf("failed to validate loglevel input: %w", err)
	}

	err = c.Kafka.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate Kafka config: %w", err)
	}

	err = c.Console.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate Console config: %w", err)
	}

	err = c.Connect.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate Connect config: %w", err)
	}

	return nil
}

// SetDefaults for all root and child config structs
func (c *Config) SetDefaults() {
	c.ServeFrontend = true
	c.MetricsNamespace = "console"

	c.Logger.SetDefaults()
	c.REST.SetDefaults()
	c.Kafka.SetDefaults()
	c.Console.SetDefaults()
	c.Connect.SetDefaults()
}

// LoadConfig read YAML-formatted config from filename into cfg.
func LoadConfig(logger *zap.Logger) (Config, error) {
	k := koanf.New(".")
	var cfg Config
	cfg.SetDefaults()

	// Flags have to be parsed first because the yaml config filepath is supposed to be passed via flags
	flagext.RegisterFlags(&cfg)
	flag.Parse()

	// 1. Check if a config filepath is set via flags. If there is one we'll try to load the file using a YAML Parser
	var configFilepath string
	if cfg.ConfigFilepath != "" {
		configFilepath = cfg.ConfigFilepath
	} else {
		envKey := "CONFIG_FILEPATH"
		configFilepath = os.Getenv(envKey)
	}
	if configFilepath == "" {
		logger.Info("config filepath is not set, proceeding with options set from env variables and flags")
	} else {
		err := k.Load(file.Provider(configFilepath), yaml.Parser())
		if err != nil {
			return Config{}, fmt.Errorf("failed to parse YAML config: %w", err)
		}
	}

	// 2. Unmarshal the config into our Config struct using the YAML and then ENV parser
	// We could unmarshal the loaded koanf input after loading both providers, however we want to unmarshal the YAML
	// config with `ErrorUnused` set to true, but unmarshal environment variables with `ErrorUnused` set to false (default).
	// Rationale: Orchestrators like Kubernetes inject unrelated environment variables, which we still want to allow.
	unmarshalCfg := koanf.UnmarshalConf{
		Tag:       "yaml",
		FlatPaths: false,
		DecoderConfig: &mapstructure.DecoderConfig{
			DecodeHook: mapstructure.ComposeDecodeHookFunc(
				mapstructure.StringToTimeDurationHookFunc()),
			Metadata:         nil,
			Result:           &cfg,
			WeaklyTypedInput: true,
			ErrorUnused:      true,
			TagName:          "yaml",
		},
	}
	err := k.UnmarshalWithConf("", &cfg, unmarshalCfg)
	if err != nil {
		return Config{}, fmt.Errorf("failed to unmarshal YAML config into config struct: %w", err)
	}

	err = k.Load(env.ProviderWithValue("", ".", func(s string, v string) (string, interface{}) {
		// key := strings.Replace(strings.ToLower(s), "_", ".", -1)
		key := strings.Replace(strings.ToLower(s), "_", ".", -1)
		// Check to exist if we have a configuration option already and see if it's a slice
		// If there is a comma in the value, split the value into a slice by the comma.
		if strings.Contains(v, ",") {
			return key, strings.Split(v, ",")
		}

		// Otherwise return the new key with the unaltered value
		return key, v
	}), nil)
	if err != nil {
		return Config{}, fmt.Errorf("failed to unmarshal environment variables into config struct: %w", err)
	}

	// Lowercase the keys that are stored internally within Koanf and reload them. This is a workaround because
	// internally keys are stored case sensitive. This causes the problem that environment variables can't match
	// the exact key and therefore will not be unmarshalled as expected anymore. Example:
	// YAML path: console.topicDocumentation.git.basicAuth.password
	// ENV path: CONSOLE_TOPICDOCUMENTATION_GIT_BASICAUTH_PASSWORD => console.topicdocumentation.git.basicauth.password
	// Internal key: console.topicDocumentation.git.basicAuth.password
	// See issue: https://github.com/cloudhut/kowl/issues/305
	keys := make(map[string]interface{}, len(k.Keys()))
	for _, key := range k.Keys() {
		keys[strings.ToLower(key)] = k.Get(key)
	}
	k.Delete("")
	err = k.Load(confmap.Provider(keys, "."), nil)
	if err != nil {
		return Config{}, fmt.Errorf("failed to unmarshal confmap variables into config struct: %w", err)
	}

	unmarshalCfg.DecoderConfig.ErrorUnused = false
	err = k.UnmarshalWithConf("", &cfg, unmarshalCfg)
	if err != nil {
		return Config{}, err
	}

	return cfg, nil
}
