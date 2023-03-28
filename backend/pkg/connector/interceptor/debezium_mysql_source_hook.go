package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

func KafkaConnectToConsoleDebeziumMysqlSourceHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "database.allowPublicKeyRetrieval",
			Type:          "BOOLEAN",
			DefaultValue:  "true",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "Allow public key retrieval",
			Documentation: "Allow the client to automatically request the public key from the server.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "database.allowPublicKeyRetrieval",
			Value:             "true",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "database.connectionTimeZone",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceLow,
			Required:      false,
			DisplayName:   "Database connection time zone",
			Documentation: "Time zone to specify explicitly the database 'connectionTimeZone' MySQL configuration option.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "database.connectionTimeZone",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "schema.history.internal.kafka.topic",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceLow,
			Required:      false,
			DisplayName:   "Schema history internal kafka topic",
			Documentation: "Schema history internal kafka topic",
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

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "topic.creation.enable",
			Type:          "BOOLEAN",
			DefaultValue:  "true",
			Importance:    model.ConfigDefinitionImportanceLow,
			Required:      false,
			DisplayName:   "Topic creation enabled",
			Documentation: "Whether to allow automatic creation of topics. Enabled by default.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "topic.creation.enable",
			Value:             "true",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "topic.creation.default.partitions",
			Type:          "LONG",
			DefaultValue:  "-1",
			Importance:    model.ConfigDefinitionImportanceLow,
			Required:      false,
			DisplayName:   "Topic creation partitions",
			Documentation: "Number of partitions for the created topics.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "topic.creation.default.partitions",
			Value:             "1",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "topic.creation.default.replication.factor",
			Type:          "LONG",
			DefaultValue:  "-1",
			Importance:    model.ConfigDefinitionImportanceLow,
			Required:      false,
			DisplayName:   "Topic creation replication factor",
			Documentation: "Replication factor for the created topics.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "topic.creation.default.replication.factor",
			Value:             "-1",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	return KafkaConnectToConsoleTopicCreationHook(KafkaConnectToConsoleJsonSchemaHook(response, config), config)
}
