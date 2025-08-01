// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package kafka provides methods for dynamically creating, caching
// and retrieving Kafka clients for the given context.
package kafka

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net"
	"os"
	"strings"
	"time"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/jcmturner/gokrb5/v8/client"
	krbconfig "github.com/jcmturner/gokrb5/v8/config"
	"github.com/jcmturner/gokrb5/v8/keytab"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sasl"
	"github.com/twmb/franz-go/pkg/sasl/aws"
	"github.com/twmb/franz-go/pkg/sasl/kerberos"
	"github.com/twmb/franz-go/pkg/sasl/oauth"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"
	"github.com/twmb/franz-go/plugin/kslog"
	"github.com/twmb/go-cache/cache"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	loggerpkg "github.com/redpanda-data/console/backend/pkg/logger"
)

// ClientFactory defines the interface for creating and retrieving Kafka clients.
type ClientFactory interface {
	// GetKafkaClient retrieves a Kafka client based on the context.
	GetKafkaClient(ctx context.Context) (*kgo.Client, *kadm.Client, error)
}

// Ensure CachedClientProvider implements KafkaClientFactory interface
var _ ClientFactory = (*CachedClientProvider)(nil)

// CachedClientProvider is responsible for managing the creation and retrieval
// of Kafka clients. It leverages caching to efficiently reuse Kafka client
// instances across multiple requests, reducing the overhead associated with
// establishing new connections frequently. The Kafka clients returned by the
// CachedClientProvider are valid for the duration of the current request's
// lifecycle, but can be retained and reused to handle multiple requests in
// quick succession. The CachedClientProvider also encapsulates the logic for
// configuring Kafka clients with various options such as TLS, SASL, and other
// Kafka-specific settings.
type CachedClientProvider struct {
	cfg         *config.Config
	logger      *slog.Logger
	clientCache *cache.Cache[string, *kgo.Client]
}

// NewCachedClientProvider creates a new CachedClientProvider with the specified
// configuration and logger, initializing the client cache with defined settings.
func NewCachedClientProvider(cfg *config.Config, logger *slog.Logger) *CachedClientProvider {
	cacheSettings := []cache.Opt{
		cache.MaxAge(30 * time.Second),
		cache.MaxErrorAge(time.Second),
	}

	return &CachedClientProvider{
		cfg:         cfg,
		logger:      logger,
		clientCache: cache.New[string, *kgo.Client](cacheSettings...),
	}
}

// GetKafkaClient retrieves a cached Kafka client. If no cached client is available,
// a new one will be created. The client returned is valid only for the duration of
// the current request's lifecycle. We retain the client after the request completes,
// as handling multiple requests in quick succession is common. Establishing a new
// Kafka connection for each request is resource-intensive and time-consuming.
func (f *CachedClientProvider) GetKafkaClient(context.Context) (*kgo.Client, *kadm.Client, error) {
	kgoClient, err, _ := f.clientCache.Get("client", func() (*kgo.Client, error) {
		return f.createClient()
	})
	if err != nil {
		return nil, nil, fmt.Errorf("failed getting Kafka client: %w", err)
	}

	return kgoClient, kadm.NewClient(kgoClient), nil
}

// createClient creates a Kafka client based on the provided Kafka configuration.
func (f *CachedClientProvider) createClient() (*kgo.Client, error) {
	kgoOpts, err := NewKgoConfig(f.cfg.Kafka, f.logger, f.cfg.MetricsNamespace)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			fmt.Errorf("failed to build Kafka config: %w", err),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_SERVER_ERROR.String()),
		)
	}

	return kgo.NewClient(kgoOpts...)
}

// NewKgoConfig creates a new Config for the Kafka Client as exposed by the franz-go library.
// If TLS certificates can't be read an error will be returned.
//
//nolint:gocognit,cyclop // This function is lengthy, but it's only plumbing configurations. Seems okay to me.
func NewKgoConfig(cfg config.Kafka, logger *slog.Logger, metricsNamespace string) ([]kgo.Opt, error) {
	metricHooks := newClientHooks(loggerpkg.Named(logger, "kafka_client_hooks"), metricsNamespace)

	opts := []kgo.Opt{
		kgo.SeedBrokers(cfg.Brokers...),
		kgo.ClientID(cfg.ClientID),
		kgo.FetchMaxBytes(5 * 1000 * 1000), // 5MB
		kgo.MaxConcurrentFetches(12),
		// We keep control records because we need to consume them in order to know whether the last message in a
		// partition is worth waiting for or not (because it's a control record which we would never receive otherwise)
		kgo.KeepControlRecords(),
		// Refresh metadata more often than the default, when the client notices that it's stale.
		kgo.MetadataMinAge(time.Second),
		kgo.WithLogger(kslog.New(loggerpkg.Named(logger, "kafka_client"))),
		kgo.WithHooks(metricHooks),
	}

	// Add Rack Awareness if configured
	if cfg.RackID != "" {
		opts = append(opts, kgo.Rack(cfg.RackID))
	}

	// Configure SASL
	if cfg.SASL.Enabled {
		// SASL Plain
		if cfg.SASL.Mechanism == config.SASLMechanismPlain {
			mechanism := plain.Auth{
				User: cfg.SASL.Username,
				Pass: cfg.SASL.Password,
			}.AsMechanism()
			opts = append(opts, kgo.SASL(mechanism))
		}

		// SASL SCRAM
		if cfg.SASL.Mechanism == config.SASLMechanismScramSHA256 || cfg.SASL.Mechanism == config.SASLMechanismScramSHA512 {
			var mechanism sasl.Mechanism
			scramAuth := scram.Auth{
				User: cfg.SASL.Username,
				Pass: cfg.SASL.Password,
			}
			if cfg.SASL.Mechanism == config.SASLMechanismScramSHA256 {
				logger.Debug("configuring SCRAM-SHA-256 mechanism")
				mechanism = scramAuth.AsSha256Mechanism()
			}
			if cfg.SASL.Mechanism == config.SASLMechanismScramSHA512 {
				logger.Debug("configuring SCRAM-SHA-512 mechanism")
				mechanism = scramAuth.AsSha512Mechanism()
			}
			opts = append(opts, kgo.SASL(mechanism))
		}

		// OAuth Bearer
		if cfg.SASL.Mechanism == config.SASLMechanismOAuthBearer {
			var mechanism sasl.Mechanism
			switch {
			case cfg.SASL.OAUth.TokenEndpoint != "":
				mechanism = oauth.Oauth(func(ctx context.Context) (oauth.Auth, error) {
					shortToken, err := cfg.SASL.OAUth.AcquireToken(ctx)
					return oauth.Auth{
						Token:      shortToken,
						Extensions: kafkaSASLOAuthExtensionsToStrMap(cfg.SASL.OAUth.Extensions),
					}, err
				})
			case cfg.SASL.OAUth.TokenFilepath != "":
				mechanism = oauth.Oauth(func(_ context.Context) (oauth.Auth, error) {
					token, err := os.ReadFile(cfg.SASL.OAUth.TokenFilepath)
					if err != nil {
						return oauth.Auth{}, fmt.Errorf("failed to open token file: %w", err)
					}
					return oauth.Auth{
						Token: strings.TrimSpace(string(token)),
					}, nil
				})
			default:
				mechanism = oauth.Auth{
					Token:      cfg.SASL.OAUth.Token,
					Extensions: kafkaSASLOAuthExtensionsToStrMap(cfg.SASL.OAUth.Extensions),
				}.AsMechanism()
			}
			opts = append(opts, kgo.SASL(mechanism))
		}

		// Kerberos
		if cfg.SASL.Mechanism == config.SASLMechanismGSSAPI {
			logger.Debug("configuring GSSAPI mechanism")
			var krbClient *client.Client

			kerbCfg, err := krbconfig.Load(cfg.SASL.GSSAPIConfig.KerberosConfigPath)
			if err != nil {
				return nil, fmt.Errorf("failed to create kerberos config from specified config filepath: %w", err)
			}
			switch cfg.SASL.GSSAPIConfig.AuthType {
			case "USER_AUTH":
				krbClient = client.NewWithPassword(
					cfg.SASL.GSSAPIConfig.Username,
					cfg.SASL.GSSAPIConfig.Realm,
					cfg.SASL.GSSAPIConfig.Password,
					kerbCfg,
					client.DisablePAFXFAST(!cfg.SASL.GSSAPIConfig.EnableFast))
			case "KEYTAB_AUTH":
				ktb, err := keytab.Load(cfg.SASL.GSSAPIConfig.KeyTabPath)
				if err != nil {
					return nil, fmt.Errorf("failed to load keytab: %w", err)
				}
				krbClient = client.NewWithKeytab(
					cfg.SASL.GSSAPIConfig.Username,
					cfg.SASL.GSSAPIConfig.Realm,
					ktb,
					kerbCfg,
					client.DisablePAFXFAST(!cfg.SASL.GSSAPIConfig.EnableFast))
			}
			kerberosMechanism := kerberos.Auth{
				Client:           krbClient,
				Service:          cfg.SASL.GSSAPIConfig.ServiceName,
				PersistAfterAuth: true,
			}.AsMechanism()
			opts = append(opts, kgo.SASL(kerberosMechanism))
		}

		// AWS MSK IAM
		if cfg.SASL.Mechanism == config.SASLMechanismAWSManagedStreamingIAM {
			var mechanism sasl.Mechanism
			// when both are set, use them
			if cfg.SASL.AWSMskIam.AccessKey != "" && cfg.SASL.AWSMskIam.SecretKey != "" {
				// SessionToken is optional
				mechanism = aws.Auth{
					AccessKey:    cfg.SASL.AWSMskIam.AccessKey,
					SecretKey:    cfg.SASL.AWSMskIam.SecretKey,
					SessionToken: cfg.SASL.AWSMskIam.SessionToken,
					UserAgent:    cfg.SASL.AWSMskIam.UserAgent,
				}.AsManagedStreamingIAMMechanism()
			} else {
				ctx, cancel := context.WithTimeout(context.Background(), cfg.SASL.AWSMskIam.ClientTimeOutDuration)
				defer cancel()
				cfgVal, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(cfg.SASL.AWSMskIam.Region))
				if err != nil {
					return nil, err
				}

				mechanism = aws.ManagedStreamingIAM(func(ctx context.Context) (aws.Auth, error) {
					creds, err := cfgVal.Credentials.Retrieve(ctx)
					if err != nil {
						return aws.Auth{}, err
					}

					return aws.Auth{
						AccessKey:    creds.AccessKeyID,
						SecretKey:    creds.SecretAccessKey,
						SessionToken: creds.SessionToken,
						UserAgent:    creds.Source,
					}, nil
				})
			}
			opts = append(opts, kgo.SASL(mechanism))
		}
	}

	if cfg.TLS.Enabled {
		tlsConfig, err := cfg.TLS.TLSConfig()
		if err != nil {
			return nil, fmt.Errorf("failed to build tls config: %w", err)
		}

		tlsDialer := &tls.Dialer{
			NetDialer: &net.Dialer{Timeout: 10 * time.Second},
			Config:    tlsConfig,
		}
		opts = append(opts, kgo.Dialer(tlsDialer.DialContext))
	}

	return opts, nil
}

func kafkaSASLOAuthExtensionsToStrMap(kafkaSASLOAuthExtensions []config.KafkaSASLOAuthExtension) map[string]string {
	extensionMap := make(map[string]string)
	for _, kafkaSASLOAuthExtension := range kafkaSASLOAuthExtensions {
		extensionMap[kafkaSASLOAuthExtension.Key] = kafkaSASLOAuthExtension.Value
	}
	return extensionMap
}
