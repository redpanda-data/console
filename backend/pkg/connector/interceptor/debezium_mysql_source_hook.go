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
	})

	return KafkaConnectToConsoleTopicCreationHook(KafkaConnectToConsoleJSONSchemaHook(response, config), config)
}
