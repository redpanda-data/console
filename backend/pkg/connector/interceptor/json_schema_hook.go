package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

// KafkaConnectToConsoleJsonSchemaHook adds key, value and header *.converter.schemas.enable properties
// to Validate response from Kafka Connect
func KafkaConnectToConsoleJsonSchemaHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	for _, prefix := range []string{"key", "value", "header"} {
		schemaSelectorVisible := false
		importance := model.ConfigDefinitionImportanceLow
		for _, config := range response.Configs {
			if config.Value.Name == prefix+".converter" {
				schemaSelectorVisible = config.Value.Value == "org.apache.kafka.connect.json.JsonConverter"
				importance = config.Definition.Importance
			}
		}

		response.Configs = append(response.Configs, model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          prefix + ".converter.schemas.enable",
				Type:          "BOOLEAN",
				DefaultValue:  "true",
				Importance:    importance,
				Required:      false,
				DisplayName:   "Message " + prefix + " JSON contains schema",
				Documentation: "Whether your message " + prefix + " contains schema in the schema field",
			},
			Value: model.ConfigDefinitionValue{
				Name:              prefix + ".converter.schemas.enable",
				Value:             getSchemaValueFromConfig(prefix+".converter.schemas.enable", config),
				RecommendedValues: []string{"true", "false"},
				Visible:           schemaSelectorVisible,
				Errors:            []string{},
			},
		})
	}

	return response
}

func getSchemaValueFromConfig(name string, configs map[string]any) any {
	config, exists := configs[name]
	if exists {
		return config
	}

	return "true"
}
