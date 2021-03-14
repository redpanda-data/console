package api

import (
	"flag"
	"fmt"
	"github.com/cloudhut/common/flagext"
	"github.com/cloudhut/kowl/backend/pkg/owl"
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
	MetricsNamespace string `koanf:"metricsNamespace"`
	ServeFrontend    bool   `koanf:"serveFrontend"` // useful for local development where we want the frontend from 'npm run start'
	FrontendPath     string `koanf:"frontendPath"`  // path to frontend files (index.html), set to './build' by default

	Owl    owl.Config     `koanf:"owl"`
	REST   rest.Config    `koanf:"server"`
	Kafka  kafka.Config   `koanf:"kafka"`
	Logger logging.Config `koanf:"logger"`
}

// RegisterFlags for all (sub)configs
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	// Package flags for sensitive input like passwords
	c.Kafka.RegisterFlags(f)
	c.Owl.RegisterFlags(f)
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
}

// LoadConfig read YAML-formatted config from filename into cfg.
func LoadConfig(logger *zap.Logger) (Config, error) {
	k := koanf.New(".")
	var cfg Config
	cfg.SetDefaults()

	var configFilepath string
	flag.StringVar(&configFilepath, "config.filepath", "", "Path to the config file")
	flag.Parse()

	// 1. Check if a config filepath is set via flags. If there is one we'll try to load the file using a YAML Parser
	if cfg.ConfigFilepath != "" {
		configFilepath = cfg.ConfigFilepath
	} else {
		envKey := "CONFIG_FILEPATH"
		configFilepath = os.Getenv(envKey)
	}
	if configFilepath == "" {
		logger.Info("a config filepath is not set, proceeding with options set from env variables and flags")
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
	err := k.UnmarshalWithConf("", &cfg, koanf.UnmarshalConf{
		Tag:       "",
		FlatPaths: false,
		DecoderConfig: &mapstructure.DecoderConfig{
			DecodeHook: mapstructure.ComposeDecodeHookFunc(
				mapstructure.StringToTimeDurationHookFunc()),
			Metadata:         nil,
			Result:           &cfg,
			WeaklyTypedInput: true,
			ErrorUnused:      true,
		},
	})
	if err != nil {
		return Config{}, err
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
		return Config{}, err
	}

	// 3. Register and parse flags
	flagext.RegisterFlags(&cfg)
	flag.Parse()

	err = k.Unmarshal("", &cfg)
	if err != nil {
		return Config{}, err
	}

	return cfg, nil
}
