package interceptor

import (
	"reflect"
	"testing"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

func TestConsoleToKafkaConnectMirrorSourceHook(t *testing.T) {
	tests := []struct {
		name   string
		config map[string]any
		want   map[string]any
	}{
		{
			name: "Should not set truststore and keystore types if given",
			config: map[string]any{
				"source.cluster.ssl.truststore.type": "JKS",
				"source.cluster.ssl.keystore.type":   "JKS",
			},
			want: map[string]any{
				"source.cluster.ssl.truststore.type": "JKS",
				"source.cluster.ssl.keystore.type":   "JKS",
			},
		},
		{
			name: "Should set source.cluster.ssl.truststore.type if not given",
			config: map[string]any{
				"source.cluster.ssl.keystore.type": "JKS",
			},
			want: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "JKS",
			},
		},
		{
			name: "Should set source.cluster.ssl.keystore.type if not given",
			config: map[string]any{
				"source.cluster.ssl.truststore.type": "JKS",
			},
			want: map[string]any{
				"source.cluster.ssl.truststore.type": "JKS",
				"source.cluster.ssl.keystore.type":   "PEM",
			},
		},
		{
			name: "Should copy source.cluster.security.protocol to security.protocol if security.protocol not given",
			config: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.security.protocol":   "SASL_SSL",
			},
			want: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.security.protocol":   "SASL_SSL",
				"security.protocol":                  "SASL_SSL",
			},
		},
		{
			name: "Should not override security.protocol if given",
			config: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.security.protocol":   "SASL_SSL",
				"security.protocol":                  "SASL_PLAINTEXT",
			},
			want: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.security.protocol":   "SASL_SSL",
				"security.protocol":                  "SASL_PLAINTEXT",
			},
		},
		{
			name: "Should set source.cluster.sasl.jaas.config if not given for non-scram sasl.mechanism",
			config: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.security.protocol":   "SASL_SSL",
				"source.cluster.sasl.mechanism":      "PLAIN",
				"source.cluster.sasl.username":       "user",
				"source.cluster.sasl.password":       "${secretsManager:connector:source.cluster.sasl.password}",
			},
			want: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.security.protocol":   "SASL_SSL",
				"security.protocol":                  "SASL_SSL",
				"source.cluster.sasl.mechanism":      "PLAIN",
				"source.cluster.sasl.username":       "user",
				"source.cluster.sasl.password":       "${secretsManager:connector:source.cluster.sasl.password}",
				"source.cluster.sasl.jaas.config":    "org.apache.kafka.common.security.plain.PlainLoginModule required username='user' password='${secretsManager:connector:source.cluster.sasl.password}';",
			},
		},
		{
			name: "Should set source.cluster.sasl.jaas.config if not given for scram sasl.mechanism",
			config: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.security.protocol":   "SASL_SSL",
				"source.cluster.sasl.mechanism":      "SCRAM-SHA-256",
				"source.cluster.sasl.username":       "user",
				"source.cluster.sasl.password":       "${secretsManager:connector:source.cluster.sasl.password}",
			},
			want: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.security.protocol":   "SASL_SSL",
				"security.protocol":                  "SASL_SSL",
				"source.cluster.sasl.mechanism":      "SCRAM-SHA-256",
				"source.cluster.sasl.username":       "user",
				"source.cluster.sasl.password":       "${secretsManager:connector:source.cluster.sasl.password}",
				"source.cluster.sasl.jaas.config":    "org.apache.kafka.common.security.scram.ScramLoginModule required username='user' password='${secretsManager:connector:source.cluster.sasl.password}';",
			},
		},
		{
			name: "Should not override source.cluster.sasl.jaas.config if given",
			config: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.security.protocol":   "SASL_SSL",
				"source.cluster.sasl.mechanism":      "PLAIN",
				"source.cluster.sasl.username":       "user",
				"source.cluster.sasl.password":       "${secretsManager:connector:source.cluster.sasl.password}",
				"source.cluster.sasl.jaas.config":    "org.apache.kafka.common.security.scram.ScramLoginModule required username='username' password='pswd';",
			},
			want: map[string]any{
				"source.cluster.ssl.truststore.type": "PEM",
				"source.cluster.ssl.keystore.type":   "PEM",
				"source.cluster.security.protocol":   "SASL_SSL",
				"security.protocol":                  "SASL_SSL",
				"source.cluster.sasl.mechanism":      "PLAIN",
				"source.cluster.sasl.username":       "user",
				"source.cluster.sasl.password":       "${secretsManager:connector:source.cluster.sasl.password}",
				"source.cluster.sasl.jaas.config":    "org.apache.kafka.common.security.scram.ScramLoginModule required username='username' password='pswd';",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ConsoleToKafkaConnectMirrorSourceHook(tt.config); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("ConsoleToKafkaConnectMirrorSourceHook() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestKafkaConnectToConsoleMirrorSourceHook(t *testing.T) {
	plain := "PLAIN"
	type args struct {
		response model.ValidationResponse
		config   map[string]any
	}
	tests := []struct {
		name string
		args args
		want model.ValidationResponse
	}{
		{
			name: "Should add missing fields to the response in case of security.protocol=PLAINTEXT",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Definition: model.ConfigDefinitionKey{
								Name:          "security.protocol",
								Type:          "STRING",
								DefaultValue:  "PLAINTEXT",
								Importance:    "HIGH",
								Required:      true,
								DisplayName:   "Security protocol",
								Documentation: "Protocol used to communicate with brokers",
							},
							Value: model.ConfigDefinitionValue{
								Name:              "security.protocol",
								Value:             "PLAINTEXT",
								RecommendedValues: []string{"PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"},
								Visible:           true,
								Errors:            []string{},
							},
						},
					},
				},
				config: nil,
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "security.protocol",
							Type:          "STRING",
							DefaultValue:  "PLAINTEXT",
							Importance:    "HIGH",
							Required:      true,
							DisplayName:   "Security protocol",
							Documentation: "Protocol used to communicate with brokers",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "security.protocol",
							Value:             "PLAINTEXT",
							RecommendedValues: []string{"PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "topics",
							Type:          "LIST",
							DefaultValue:  ".*",
							Importance:    "HIGH",
							Required:      false,
							DisplayName:   "Topics",
							Documentation: "Topics to replicate. Supports comma-separated topic names and regexes",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "topics",
							Value:             ".*",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "topics.exclude",
							Type:          "LIST",
							DefaultValue:  ".*[\\-\\.]internal,.*\\.replica,__consumer_offsets,_redpanda_e2e_probe,__redpanda.cloud.sla_verification,_internal_connectors.*,_schemas",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Topics exclude",
							Documentation: "Excluded topics. Supports comma-separated topic names and regexes",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "topics.exclude",
							Value:             ".*[\\-\\.]internal,.*\\.replica,__consumer_offsets,_redpanda_e2e_probe,__redpanda.cloud.sla_verification,_internal_connectors.*,_schemas",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.bootstrap.servers",
							Type:         "STRING",
							DefaultValue: "",
							Importance:   "HIGH",
							Required:     true,
							DisplayName:  "Source cluster broker list",
							Documentation: "A list of host/port pairs to use for establishing the initial connection to the Redpanda cluster. " +
								"The client will make use of all servers irrespective of which servers are specified here for " +
								"bootstrapping - this list only impacts the initial hosts used to discover the full set of servers. " +
								"This list should be in the form \"host1:port1,host2:port2,...\". Since these servers are just used " +
								"for the initial connection to discover the full cluster membership (which may change dynamically), " +
								"this list need not contain the full set of servers (you may want more than one, though, in case a server is down)",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.bootstrap.servers",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.security.protocol",
							Type:          "STRING",
							DefaultValue:  "PLAINTEXT",
							Importance:    "HIGH",
							Required:      true,
							DisplayName:   "Source cluster security protocol",
							Documentation: "Protocol used to communicate with source brokers",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.security.protocol",
							Value:             "PLAINTEXT",
							RecommendedValues: []string{"PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:               "source.cluster.sasl.mechanism",
							Type:               "STRING",
							DefaultValue:       "GSSAPI",
							CustomDefaultValue: &plain,
							Importance:         "HIGH",
							Required:           false,
							DisplayName:        "Source cluster SASL mechanism",
							Documentation:      "SASL mechanism used for client connections. This may be any mechanism for which a security provider is available. PLAIN is the default mechanism",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.mechanism",
							Value:             "GSSAPI",
							RecommendedValues: []string{"PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512", "GSSAPI"},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.sasl.username",
							Type:         "STRING",
							DefaultValue: "",
							Importance:   "HIGH",
							Required:     false,
							DisplayName:  "Source cluster SASL username",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.username",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.sasl.password",
							Type:         "PASSWORD",
							DefaultValue: "",
							Importance:   "HIGH",
							Required:     false,
							DisplayName:  "Source cluster SASL password",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.password",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.sasl.jaas.config",
							Type:         "PASSWORD",
							DefaultValue: "",
							Importance:   "MEDIUM",
							Required:     false,
							DisplayName:  "Source cluster SASL JAAS config",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.jaas.config",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.ssl.truststore.certificates",
							Type:          "PASSWORD",
							DefaultValue:  "",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Source cluster SSL custom certificate",
							Documentation: "Trusted certificates in the PEM format",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.ssl.truststore.certificates",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.ssl.keystore.key",
							Type:          "PASSWORD",
							DefaultValue:  "",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Source cluster SSL keystore key",
							Documentation: "Private key in the PEM format",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.ssl.keystore.key",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.ssl.keystore.certificate.chain",
							Type:          "PASSWORD",
							DefaultValue:  "",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Source cluster SSL keystore certificate chain",
							Documentation: "Certificate chain in the PEM format",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.ssl.keystore.certificate.chain",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "producer.override.max.request.size",
							Type:          "INT",
							DefaultValue:  "1048576",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Max size of a request",
							Documentation: "The maximum size of a request in bytes. This setting will limit the number of record batches the producer will send in a single request to avoid sending huge requests. This is also effectively a cap on the maximum uncompressed record batch size. Note that the server has its own cap on the record batch size (after compression if compression is enabled) which may be different from this. The default is 1048576",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "producer.override.max.request.size",
							Value:             "1048576",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "producer.override.compression.type",
							Type:          "STRING",
							DefaultValue:  "none",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Compression type",
							Documentation: "The compression type for all data generated by the producer. The default is none (i.e. no compression)",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "producer.override.compression.type",
							Value:             "none",
							RecommendedValues: []string{"none", "gzip", "snappy", "lz4", "zstd"},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{
									Value:       "none",
									DisplayName: "NONE",
								},
								{
									Value:       "gzip",
									DisplayName: "GZIP",
								},
								{
									Value:       "snappy",
									DisplayName: "SNAPPY",
								},
								{
									Value:       "lz4",
									DisplayName: "LZ4",
								},
								{
									Value:       "zstd",
									DisplayName: "ZSTD",
								},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "consumer.auto.offset.reset",
							Type:          "STRING",
							DefaultValue:  "earliest",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Auto offset reset",
							Documentation: "What to do when there is no initial offset in Kafka or if the current offset does not exist any more on the server (e.g. because that data has been deleted). 'earliest' - automatically reset the offset to the earliest offset. 'latest' - automatically reset the offset to the latest offset. 'none' - throw exception to the consumer if no previous offset is found for the consumer's group",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "consumer.auto.offset.reset",
							Value:             "none",
							RecommendedValues: []string{"earliest", "latest", "none"},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{
									Value:       "earliest",
									DisplayName: "earliest",
								},
								{
									Value:       "latest",
									DisplayName: "latest",
								},
								{
									Value:       "none",
									DisplayName: "none",
								},
							},
						},
					},
				},
			},
		},
		{
			name: "Should add missing fields to the response in case of security.protocol=SASL",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Definition: model.ConfigDefinitionKey{
								Name:          "security.protocol",
								Type:          "STRING",
								DefaultValue:  "PLAINTEXT",
								Importance:    "HIGH",
								Required:      true,
								DisplayName:   "Security protocol",
								Documentation: "Protocol used to communicate with brokers",
							},
							Value: model.ConfigDefinitionValue{
								Name:              "security.protocol",
								Value:             "SASL_SSL",
								RecommendedValues: []string{"PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"},
								Visible:           true,
								Errors:            []string{},
							},
						},
					},
				},
				config: nil,
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "security.protocol",
							Type:          "STRING",
							DefaultValue:  "PLAINTEXT",
							Importance:    "HIGH",
							Required:      true,
							DisplayName:   "Security protocol",
							Documentation: "Protocol used to communicate with brokers",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "security.protocol",
							Value:             "SASL_SSL",
							RecommendedValues: []string{"PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "topics",
							Type:          "LIST",
							DefaultValue:  ".*",
							Importance:    "HIGH",
							Required:      false,
							DisplayName:   "Topics",
							Documentation: "Topics to replicate. Supports comma-separated topic names and regexes",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "topics",
							Value:             ".*",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "topics.exclude",
							Type:          "LIST",
							DefaultValue:  ".*[\\-\\.]internal,.*\\.replica,__consumer_offsets,_redpanda_e2e_probe,__redpanda.cloud.sla_verification,_internal_connectors.*,_schemas",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Topics exclude",
							Documentation: "Excluded topics. Supports comma-separated topic names and regexes",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "topics.exclude",
							Value:             ".*[\\-\\.]internal,.*\\.replica,__consumer_offsets,_redpanda_e2e_probe,__redpanda.cloud.sla_verification,_internal_connectors.*,_schemas",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.bootstrap.servers",
							Type:         "STRING",
							DefaultValue: "",
							Importance:   "HIGH",
							Required:     true,
							DisplayName:  "Source cluster broker list",
							Documentation: "A list of host/port pairs to use for establishing the initial connection to the Redpanda cluster. " +
								"The client will make use of all servers irrespective of which servers are specified here for " +
								"bootstrapping - this list only impacts the initial hosts used to discover the full set of servers. " +
								"This list should be in the form \"host1:port1,host2:port2,...\". Since these servers are just used " +
								"for the initial connection to discover the full cluster membership (which may change dynamically), " +
								"this list need not contain the full set of servers (you may want more than one, though, in case a server is down)",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.bootstrap.servers",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.security.protocol",
							Type:          "STRING",
							DefaultValue:  "PLAINTEXT",
							Importance:    "HIGH",
							Required:      true,
							DisplayName:   "Source cluster security protocol",
							Documentation: "Protocol used to communicate with source brokers",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.security.protocol",
							Value:             "PLAINTEXT",
							RecommendedValues: []string{"PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:               "source.cluster.sasl.mechanism",
							Type:               "STRING",
							DefaultValue:       "GSSAPI",
							CustomDefaultValue: &plain,
							Importance:         "HIGH",
							Required:           false,
							DisplayName:        "Source cluster SASL mechanism",
							Documentation:      "SASL mechanism used for client connections. This may be any mechanism for which a security provider is available. PLAIN is the default mechanism",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.mechanism",
							Value:             "GSSAPI",
							RecommendedValues: []string{"PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512", "GSSAPI"},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.sasl.username",
							Type:         "STRING",
							DefaultValue: "",
							Importance:   "HIGH",
							Required:     false,
							DisplayName:  "Source cluster SASL username",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.username",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.sasl.password",
							Type:         "PASSWORD",
							DefaultValue: "",
							Importance:   "HIGH",
							Required:     false,
							DisplayName:  "Source cluster SASL password",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.password",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.sasl.jaas.config",
							Type:         "PASSWORD",
							DefaultValue: "",
							Importance:   "MEDIUM",
							Required:     false,
							DisplayName:  "Source cluster SASL JAAS config",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.jaas.config",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.ssl.truststore.certificates",
							Type:          "PASSWORD",
							DefaultValue:  "",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Source cluster SSL custom certificate",
							Documentation: "Trusted certificates in the PEM format",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.ssl.truststore.certificates",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.ssl.keystore.key",
							Type:          "PASSWORD",
							DefaultValue:  "",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Source cluster SSL keystore key",
							Documentation: "Private key in the PEM format",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.ssl.keystore.key",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.ssl.keystore.certificate.chain",
							Type:          "PASSWORD",
							DefaultValue:  "",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Source cluster SSL keystore certificate chain",
							Documentation: "Certificate chain in the PEM format",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.ssl.keystore.certificate.chain",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "producer.override.max.request.size",
							Type:          "INT",
							DefaultValue:  "1048576",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Max size of a request",
							Documentation: "The maximum size of a request in bytes. This setting will limit the number of record batches the producer will send in a single request to avoid sending huge requests. This is also effectively a cap on the maximum uncompressed record batch size. Note that the server has its own cap on the record batch size (after compression if compression is enabled) which may be different from this. The default is 1048576",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "producer.override.max.request.size",
							Value:             "1048576",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "producer.override.compression.type",
							Type:          "STRING",
							DefaultValue:  "none",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Compression type",
							Documentation: "The compression type for all data generated by the producer. The default is none (i.e. no compression)",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "producer.override.compression.type",
							Value:             "none",
							RecommendedValues: []string{"none", "gzip", "snappy", "lz4", "zstd"},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{
									Value:       "none",
									DisplayName: "NONE",
								},
								{
									Value:       "gzip",
									DisplayName: "GZIP",
								},
								{
									Value:       "snappy",
									DisplayName: "SNAPPY",
								},
								{
									Value:       "lz4",
									DisplayName: "LZ4",
								},
								{
									Value:       "zstd",
									DisplayName: "ZSTD",
								},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "consumer.auto.offset.reset",
							Type:          "STRING",
							DefaultValue:  "earliest",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Auto offset reset",
							Documentation: "What to do when there is no initial offset in Kafka or if the current offset does not exist any more on the server (e.g. because that data has been deleted). 'earliest' - automatically reset the offset to the earliest offset. 'latest' - automatically reset the offset to the latest offset. 'none' - throw exception to the consumer if no previous offset is found for the consumer's group",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "consumer.auto.offset.reset",
							Value:             "none",
							RecommendedValues: []string{"earliest", "latest", "none"},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{
									Value:       "earliest",
									DisplayName: "earliest",
								},
								{
									Value:       "latest",
									DisplayName: "latest",
								},
								{
									Value:       "none",
									DisplayName: "none",
								},
							},
						},
					},
				},
			},
		},
		{
			name: "Should add missing fields to the response in case of missing security.protocol",
			args: args{
				config: nil,
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "topics",
							Type:          "LIST",
							DefaultValue:  ".*",
							Importance:    "HIGH",
							Required:      false,
							DisplayName:   "Topics",
							Documentation: "Topics to replicate. Supports comma-separated topic names and regexes",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "topics",
							Value:             ".*",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "topics.exclude",
							Type:          "LIST",
							DefaultValue:  ".*[\\-\\.]internal,.*\\.replica,__consumer_offsets,_redpanda_e2e_probe,__redpanda.cloud.sla_verification,_internal_connectors.*,_schemas",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Topics exclude",
							Documentation: "Excluded topics. Supports comma-separated topic names and regexes",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "topics.exclude",
							Value:             ".*[\\-\\.]internal,.*\\.replica,__consumer_offsets,_redpanda_e2e_probe,__redpanda.cloud.sla_verification,_internal_connectors.*,_schemas",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.bootstrap.servers",
							Type:         "STRING",
							DefaultValue: "",
							Importance:   "HIGH",
							Required:     true,
							DisplayName:  "Source cluster broker list",
							Documentation: "A list of host/port pairs to use for establishing the initial connection to the Redpanda cluster. " +
								"The client will make use of all servers irrespective of which servers are specified here for " +
								"bootstrapping - this list only impacts the initial hosts used to discover the full set of servers. " +
								"This list should be in the form \"host1:port1,host2:port2,...\". Since these servers are just used " +
								"for the initial connection to discover the full cluster membership (which may change dynamically), " +
								"this list need not contain the full set of servers (you may want more than one, though, in case a server is down)",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.bootstrap.servers",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.security.protocol",
							Type:          "STRING",
							DefaultValue:  "PLAINTEXT",
							Importance:    "HIGH",
							Required:      true,
							DisplayName:   "Source cluster security protocol",
							Documentation: "Protocol used to communicate with source brokers",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.security.protocol",
							Value:             "PLAINTEXT",
							RecommendedValues: []string{"PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:               "source.cluster.sasl.mechanism",
							Type:               "STRING",
							DefaultValue:       "GSSAPI",
							CustomDefaultValue: &plain,
							Importance:         "HIGH",
							Required:           false,
							DisplayName:        "Source cluster SASL mechanism",
							Documentation:      "SASL mechanism used for client connections. This may be any mechanism for which a security provider is available. PLAIN is the default mechanism",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.mechanism",
							Value:             "GSSAPI",
							RecommendedValues: []string{"PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512", "GSSAPI"},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.sasl.username",
							Type:         "STRING",
							DefaultValue: "",
							Importance:   "HIGH",
							Required:     false,
							DisplayName:  "Source cluster SASL username",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.username",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.sasl.password",
							Type:         "PASSWORD",
							DefaultValue: "",
							Importance:   "HIGH",
							Required:     false,
							DisplayName:  "Source cluster SASL password",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.password",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:         "source.cluster.sasl.jaas.config",
							Type:         "PASSWORD",
							DefaultValue: "",
							Importance:   "MEDIUM",
							Required:     false,
							DisplayName:  "Source cluster SASL JAAS config",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.sasl.jaas.config",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.ssl.truststore.certificates",
							Type:          "PASSWORD",
							DefaultValue:  "",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Source cluster SSL custom certificate",
							Documentation: "Trusted certificates in the PEM format",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.ssl.truststore.certificates",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.ssl.keystore.key",
							Type:          "PASSWORD",
							DefaultValue:  "",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Source cluster SSL keystore key",
							Documentation: "Private key in the PEM format",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.ssl.keystore.key",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "source.cluster.ssl.keystore.certificate.chain",
							Type:          "PASSWORD",
							DefaultValue:  "",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Source cluster SSL keystore certificate chain",
							Documentation: "Certificate chain in the PEM format",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "source.cluster.ssl.keystore.certificate.chain",
							Value:             "",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "producer.override.max.request.size",
							Type:          "INT",
							DefaultValue:  "1048576",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Max size of a request",
							Documentation: "The maximum size of a request in bytes. This setting will limit the number of record batches the producer will send in a single request to avoid sending huge requests. This is also effectively a cap on the maximum uncompressed record batch size. Note that the server has its own cap on the record batch size (after compression if compression is enabled) which may be different from this. The default is 1048576",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "producer.override.max.request.size",
							Value:             "1048576",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "producer.override.compression.type",
							Type:          "STRING",
							DefaultValue:  "none",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Compression type",
							Documentation: "The compression type for all data generated by the producer. The default is none (i.e. no compression)",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "producer.override.compression.type",
							Value:             "none",
							RecommendedValues: []string{"none", "gzip", "snappy", "lz4", "zstd"},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{
									Value:       "none",
									DisplayName: "NONE",
								},
								{
									Value:       "gzip",
									DisplayName: "GZIP",
								},
								{
									Value:       "snappy",
									DisplayName: "SNAPPY",
								},
								{
									Value:       "lz4",
									DisplayName: "LZ4",
								},
								{
									Value:       "zstd",
									DisplayName: "ZSTD",
								},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "consumer.auto.offset.reset",
							Type:          "STRING",
							DefaultValue:  "earliest",
							Importance:    "MEDIUM",
							Required:      false,
							DisplayName:   "Auto offset reset",
							Documentation: "What to do when there is no initial offset in Kafka or if the current offset does not exist any more on the server (e.g. because that data has been deleted). 'earliest' - automatically reset the offset to the earliest offset. 'latest' - automatically reset the offset to the latest offset. 'none' - throw exception to the consumer if no previous offset is found for the consumer's group",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "consumer.auto.offset.reset",
							Value:             "none",
							RecommendedValues: []string{"earliest", "latest", "none"},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{
									Value:       "earliest",
									DisplayName: "earliest",
								},
								{
									Value:       "latest",
									DisplayName: "latest",
								},
								{
									Value:       "none",
									DisplayName: "none",
								},
							},
						},
					},
				},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := KafkaConnectToConsoleMirrorSourceHook(tt.args.response, tt.args.config); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("KafkaConnectToConsoleMirrorSourceHook() = %v, want %v", got, tt.want)
			}
		})
	}
}
