package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

// KafkaConnectToConsoleCloudEventsConverterHook adds key and value CloudEvents converter specific properties
// to Validate response from Kafka Connect
func KafkaConnectToConsoleCloudEventsConverterHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	for _, prefix := range []string{"key", "value"} {
		schemaSelectorVisible := false
		importance := model.ConfigDefinitionImportanceLow
		for _, config := range response.Configs {
			if config.Value.Name == prefix+".converter" {
				schemaSelectorVisible = config.Value.Value == "io.debezium.converters.CloudEventsConverter"
				importance = config.Definition.Importance
			}
		}
		propertyName := prefix + ".converter.json.schemas.enable"
		response.Configs = append(response.Configs, model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          propertyName,
				Type:          "BOOLEAN",
				DefaultValue:  "true",
				Importance:    importance,
				Required:      false,
				DisplayName:   "Message " + prefix + " CloudEvents JSON contains schema",
				Documentation: "Whether your message " + prefix + " contains schema in the schema field",
			},
			Value: model.ConfigDefinitionValue{
				Name:              propertyName,
				Value:             getPropertyValueFromConfig(propertyName, config),
				RecommendedValues: []string{"true", "false"},
				Visible:           schemaSelectorVisible,
				Errors:            []string{},
			},
		})
	}

	return response
}

func getPropertyValueFromConfig(name string, configs map[string]any) any {
	config, exists := configs[name]
	if exists {
		return config
	}

	return "true"
}
