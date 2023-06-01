package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

// KafkaConnectToConsoleDebeziumMysqlSourceHook adds MySQL Debezium source specific config options
// missing in Validate Kafka Connect response
func KafkaConnectToConsoleDebeziumMysqlSourceHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "database.allowPublicKeyRetrieval",
			Type:          "BOOLEAN",
			DefaultValue:  "true",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "Allow public key retrieval",
			Documentation: "Allow the client to automatically request the public key from the server",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "database.allowPublicKeyRetrieval",
			Value:             "true",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	}, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "database.connectionTimeZone",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceLow,
			Required:      false,
			DisplayName:   "Database connection time zone",
			Documentation: "Time zone to specify explicitly the database 'connectionTimeZone' MySQL configuration option",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "database.connectionTimeZone",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	}, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "schema.history.internal.kafka.topic",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceLow,
			Required:      false,
			DisplayName:   "Schema history internal Redpanda topic",
			Documentation: "Schema history internal Redpanda topic",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "schema.history.internal.kafka.topic",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           false,
			Errors:            []string{},
		},
	},
		model.ConfigDefinition{
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
		})

	return KafkaConnectToConsoleTopicCreationHook(KafkaConnectToConsoleJSONSchemaHook(response, config), config)
}
