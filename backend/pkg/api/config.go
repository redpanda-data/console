package api

import (
	"flag"
	"fmt"
	"github.com/cloudhut/common/flagext"
	"github.com/cloudhut/kowl/backend/pkg/connect"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/cloudhut/kowl/backend/pkg/tsdb"
	"github.com/knadh/koanf"
	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
	"github.com/mitchellh/mapstructure"
	"go.uber.org/zap"
	"os"
	"strings"

	"github.com/cloudhut/common/logging"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
)

// Config holds all (subdependency)Configs needed to run the API
type Config struct {
	ConfigFilepath   string
	MetricsNamespace string `yaml:"metricsNamespace"`
	ServeFrontend    bool   `yaml:"serveFrontend"` // useful for local development where we want the frontend from 'npm run start'
	FrontendPath     string `yaml:"frontendPath"`  // path to frontend files (index.html), set to './build' by default

	Owl     owl.Config     `yaml:"owl"`
	Connect connect.Config `yaml:"connect"`
	REST    rest.Config    `yaml:"server"`
	Kafka   kafka.Config   `yaml:"kafka"`
	TSDB    tsdb.Config    `yaml:"tsdb"`
	Logger  logging.Config `yaml:"logger"`
}

// RegisterFlags for all (sub)configs
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.ConfigFilepath, "config.filepath", "", "Path to the config file")

	// Package flags for sensitive input like passwords
	c.Kafka.RegisterFlags(f)
	c.Owl.RegisterFlags(f)
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

	err = c.Owl.Validate()
	if err != nil {
		return fmt.Errorf("failed to validate Owl config: %w", err)
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
	c.FrontendPath = "./build"
	c.MetricsNamespace = "kowl"

	c.Logger.SetDefaults()
	c.REST.SetDefaults()
	c.Kafka.SetDefaults()
	c.Owl.SetDefaults()
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

	unmarshalCfg.DecoderConfig.ErrorUnused = false
	err = k.UnmarshalWithConf("", &cfg, unmarshalCfg)
	if err != nil {
		return Config{}, err
	}

	return cfg, nil
}
