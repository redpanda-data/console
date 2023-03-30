package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

func ConsoleToKafkaConnectMirrorSourceHook(config map[string]any) map[string]any {
	setIfNotExists(config, "source.cluster.ssl.truststore.type", "PEM")

	return config
}

func KafkaConnectToConsoleMirrorSourceHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
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
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "source.cluster.sasl.mechanism",
				Type:          "STRING",
				DefaultValue:  "PLAIN",
				Importance:    "MEDIUM",
				Required:      false,
				DisplayName:   "Source cluster SASL mechanism",
				Documentation: "SASL mechanism used for client connections. This may be any mechanism for which a security provider is available. GSSAPI is the default mechanism.",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "source.cluster.sasl.mechanism",
				Value:             "PLAIN",
				RecommendedValues: []string{"PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512", "GSSAPI"},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "source.cluster.sasl.jaas.config",
				Type:          "STRING",
				DefaultValue:  "org.apache.kafka.common.security.plain.PlainLoginModule required username='...' password='...';",
				Importance:    "MEDIUM",
				Required:      false,
				DisplayName:   "Source cluster SASL JAAS config",
				Documentation: "JAAS login context parameters for SASL connections in the format used by JAAS configuration files. JAAS configuration file format is described <a href=\\\"http://docs.oracle.com/javase/8/docs/technotes/guides/security/jgss/tutorials/LoginConfigFile.html\\\">here</a>. The format for the value is: <code>loginModuleClass controlFlag (optionName=optionValue)*;</code>. For brokers, the config must be prefixed with listener prefix and SASL mechanism name in lower-case. For example, listener.name.sasl_ssl.scram-sha-256.sasl.jaas.config=com.example.ScramLoginModule required;",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "source.cluster.sasl.jaas.config",
				Value:             "org.apache.kafka.common.security.plain.PlainLoginModule required username='...' password='...';",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "source.cluster.ssl.truststore.certificates",
				Type:          "STRING",
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
	)

	return response
}

func setIfNotExists(config map[string]any, key string, value string) {
	if _, exists := config[key]; !exists {
		config[key] = value
	}
}
