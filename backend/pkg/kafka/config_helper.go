// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/jcmturner/gokrb5/v8/client"
	krbconfig "github.com/jcmturner/gokrb5/v8/config"
	"github.com/jcmturner/gokrb5/v8/keytab"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kversion"
	"github.com/twmb/franz-go/pkg/sasl"
	"github.com/twmb/franz-go/pkg/sasl/aws"
	"github.com/twmb/franz-go/pkg/sasl/kerberos"
	"github.com/twmb/franz-go/pkg/sasl/oauth"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"
	"github.com/twmb/franz-go/plugin/kzap"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
)

// NewKgoConfig creates a new Config for the Kafka Client as exposed by the franz-go library.
// If TLS certificates can't be read an error will be returned.
//
//nolint:gocognit,cyclop // This function is lengthy, but it's only plumbing configurations. Seems okay to me.
func NewKgoConfig(cfg *config.Kafka, logger *zap.Logger, hooks kgo.Hook) ([]kgo.Opt, error) {
	opts := []kgo.Opt{
		kgo.SeedBrokers(cfg.Brokers...),
		kgo.MaxVersions(kversion.V2_6_0()),
		kgo.ClientID(cfg.ClientID),
		kgo.FetchMaxBytes(5 * 1000 * 1000), // 5MB
		kgo.MaxConcurrentFetches(12),
		// We keep control records because we need to consume them in order to know whether the last message in a
		// partition is worth waiting for or not (because it's a control record which we would never receive otherwise)
		kgo.KeepControlRecords(),
		// Refresh metadata more often than the default, when the client notices that it's stale.
		kgo.MetadataMinAge(time.Second),
		kgo.WithLogger(kzap.New(logger.Named("kafka_client"))),
		kgo.WithHooks(hooks),
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
			if cfg.SASL.OAUth.TokenEndpoint != "" {
				mechanism = oauth.Oauth(func(ctx context.Context) (oauth.Auth, error) {
					shortToken, err := cfg.SASL.OAUth.AcquireToken(ctx)
					return oauth.Auth{
						Token:      shortToken,
						Extensions: kafkaSASLOAuthExtensionsToStrMap(cfg.SASL.OAUth.Extensions),
					}, err
				})
			} else {
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
