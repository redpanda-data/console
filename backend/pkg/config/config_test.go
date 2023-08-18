package config

import (
	"flag"
	"os"
	"testing"

	"github.com/cloudhut/common/logging"
	"github.com/cloudhut/common/rest"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

const configPathKey = "CONFIG_FILEPATH"

var (
	logger, _            = zap.NewDevelopment()
	defaultConfiguration = Config{
		MetricsNamespace: "console",
		ServeFrontend:    true,
		Console: Console{
			Enabled: true,
			TopicDocumentation: ConsoleTopicDocumentation{
				Git: Git{
					AllowedFileExtensions: []string{".md"},
					MaxFileSize:           500000,
					RefreshInterval:       60000000000,
					Repository: GitRepository{
						BaseDirectory: ".",
						MaxDepth:      15,
					},
				},
			},
		},
		Connect: Connect{
			ConnectTimeout: 15000000000,
			ReadTimeout:    6000000000,
			RequestTimeout: 6000000000,
		},
		REST: Server{
			Config: rest.Config{
				ServerGracefulShutdownTimeout:   30000000000,
				HTTPListenPort:                  8080,
				HTTPServerReadTimeout:           30000000000,
				HTTPServerWriteTimeout:          30000000000,
				HTTPServerIdleTimeout:           30000000000,
				HTTPSListenPort:                 8081,
				CompressionLevel:                4,
				SetBasePathFromXForwardedPrefix: true,
				StripPrefix:                     true,
			},
		},
		Kafka: Kafka{
			ClientID: "redpanda-console",
			Protobuf: Proto{
				SchemaRegistry: ProtoSchemaRegistry{
					RefreshInterval: 300000000000,
				},
				Git: Git{
					AllowedFileExtensions: []string{"proto"},
					MaxFileSize:           500000,
					IndexByFullFilepath:   true,
					RefreshInterval:       60000000000,
					Repository: GitRepository{
						BaseDirectory: ".",
						MaxDepth:      15,
					},
				},
				FileSystem: Filesystem{
					AllowedFileExtensions: []string{"proto"},
					MaxFileSize:           500000,
					IndexByFullFilepath:   true,
					RefreshInterval:       300000000000,
				},
			},
			MessagePack: Msgpack{
				TopicNames: []string{"/.*/"},
			},
			SASL: KafkaSASL{
				Mechanism: "PLAIN",
				GSSAPIConfig: KafkaSASLGSSAPI{
					EnableFast: true,
				},
			},
			Startup: KafkaStartup{
				EstablishConnectionEagerly: true,
				MaxRetries:                 5,
				RetryInterval:              1000000000,
				MaxRetryInterval:           60000000000,
				BackoffMultiplier:          2,
			},
		},
		Logger: logging.Config{
			LogLevelInput: "info",
			LogLevel:      zap.NewAtomicLevelAt(zap.InfoLevel),
		},
	}
)

func setup(t *testing.T, configPath string) {
	flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
	t.Setenv(configPathKey, configPath)
}

func TestDefaultConfiguration(t *testing.T) {
	setup(t, "")
	cfg, err := LoadConfig(logger)
	assert.NoError(t, err)
	assert.Equal(t, defaultConfiguration, cfg)
}

func TestGitConfiguration(t *testing.T) {
	setup(t, "testdata/git-config.yaml")
	expected := defaultConfiguration
	expected.Kafka.Protobuf.Enabled = true
	expected.Kafka.Protobuf.Git.Enabled = true
	expected.Kafka.Protobuf.Git.Repository = GitRepository{
		URL:           "https://github.com/redpanda-data/console.git",
		Branch:        "release-1.0",
		BaseDirectory: ".",
		MaxDepth:      3,
	}
	cfg, err := LoadConfig(logger)
	assert.NoError(t, err)
	assert.Equal(t, expected, cfg)
}

func TestInvalidConfiguration(t *testing.T) {
	setup(t, "testdata/invalid-config.yaml")
	_, err := LoadConfig(logger)
	assert.Error(t, err)
}
