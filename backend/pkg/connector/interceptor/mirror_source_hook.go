package interceptor

import (
	"github.com/redpanda-data/console/backend/pkg/connector/model"
	"strings"
)

// ConsoleToKafkaConnectMirrorSourceHook sets MirrorMaker source connector
// config options, mainly related to source and target authentication
func ConsoleToKafkaConnectMirrorSourceHook(config map[string]any) map[string]any {
	setIfNotExists(config, "source.cluster.ssl.truststore.type", "PEM")
	setIfNotExists(config, "source.cluster.ssl.keystore.type", "PEM")

	if _, exists := config["source.cluster.security.protocol"]; exists {
		setIfNotExists(config, "security.protocol", config["source.cluster.security.protocol"])
	}

	module := "org.apache.kafka.common.security.plain.PlainLoginModule"
	if saslMechanism, exists := config["source.cluster.sasl.mechanism"]; exists {
		if strings.HasPrefix(saslMechanism.(string), "SCRAM") {
			module = "org.apache.kafka.common.security.scram.ScramLoginModule"
		}
	}

	if config["source.cluster.sasl.username"] != nil && config["source.cluster.sasl.password"] != nil && config["source.cluster.sasl.jaas.config"] == nil {
		config["source.cluster.sasl.jaas.config"] = module + " required username='" + config["source.cluster.sasl.username"].(string) + "' password='" + config["source.cluster.sasl.password"].(string) + "';"
	}

	return config
}

// KafkaConnectToConsoleMirrorSourceHook adds MirrorMaker source specific config options
// missing in Validate Kafka Connect response
func KafkaConnectToConsoleMirrorSourceHook(response model.ValidationResponse, _ map[string]any) model.ValidationResponse {
	securityProtocol := getConfig(&response, "security.protocol")

	sasl := false
	if securityProtocol != nil {
		sasl = strings.Contains(securityProtocol.Value.Value.(string), "SASL")
		securityProtocol.Value.Visible = false
	}

	plain := "PLAIN"
	response.Configs = append(response.Configs,
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:         "source.cluster.bootstrap.servers",
				Type:         "STRING",
				DefaultValue: "",
				Importance:   "HIGH",
				Required:     true,
				DisplayName:  "Source cluster broker list",
				Documentation: "A list of host/port pairs to use for establishing the initial connection to the Kafka cluster. " +
					"The client will make use of all servers irrespective of which servers are specified here for " +
					"bootstrapping - this list only impacts the initial hosts used to discover the full set of servers. " +
					"This list should be in the form \"host1:port1,host2:port2,...\". Since these servers are just used " +
					"for the initial connection to discover the full cluster membership (which may change dynamically), " +
					"this list need not contain the full set of servers (you may want more than one, though, in case a server is down).",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "source.cluster.bootstrap.servers",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "source.cluster.security.protocol",
				Type:          "STRING",
				DefaultValue:  "PLAINTEXT",
				Importance:    "HIGH",
				Required:      true,
				DisplayName:   "Source cluster security protocol",
				Documentation: "Protocol used to communicate with source brokers.",
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
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:               "source.cluster.sasl.mechanism",
				Type:               "STRING",
				DefaultValue:       "GSSAPI",
				CustomDefaultValue: &plain,
				Importance:         "HIGH",
				Required:           false,
				DisplayName:        "Source cluster SASL mechanism",
				Documentation:      "SASL mechanism used for client connections. This may be any mechanism for which a security provider is available. PLAIN is the default mechanism.",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "source.cluster.sasl.mechanism",
				Value:             "GSSAPI",
				RecommendedValues: []string{"PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512", "GSSAPI"},
				Visible:           sasl,
				Errors:            []string{},
			},
			Metadata: model.ConfigDefinitionMetadata{
				ComponentType: model.ComponentRadioGroup,
			},
		},
		model.ConfigDefinition{
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
				Visible:           sasl,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
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
				Visible:           sasl,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "source.cluster.ssl.truststore.certificates",
				Type:          "PASSWORD",
				DefaultValue:  "",
				Importance:    "MEDIUM",
				Required:      false,
				DisplayName:   "Source cluster SSL custom certificate",
				Documentation: "Trusted certificates in the PEM format.",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "source.cluster.ssl.truststore.certificates",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "source.cluster.ssl.keystore.key",
				Type:          "PASSWORD",
				DefaultValue:  "",
				Importance:    "MEDIUM",
				Required:      false,
				DisplayName:   "Source cluster SSL keystore key",
				Documentation: "Private key in the PEM format.",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "source.cluster.ssl.keystore.key",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "source.cluster.ssl.keystore.certificate.chain",
				Type:          "PASSWORD",
				DefaultValue:  "",
				Importance:    "MEDIUM",
				Required:      false,
				DisplayName:   "Source cluster SSL keystore certificate chain",
				Documentation: "Certificate chain in the PEM format.",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "source.cluster.ssl.keystore.certificate.chain",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "producer.override.compression.type",
				Type:          "STRING",
				DefaultValue:  "none",
				Importance:    "MEDIUM",
				Required:      false,
				DisplayName:   "Compression type",
				Documentation: "The compression type for all data generated by the producer. The default is none (i.e. no compression).",
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
	)

	return response
}

func setIfNotExists(config map[string]any, key string, value any) {
	if _, exists := config[key]; !exists {
		config[key] = value
	}
}
