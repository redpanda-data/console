package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

// KafkaConnectToConsoleCloudEventsConverterHook adds key and value CloudEvents converter specific properties
// to Validate response from Kafka Connect
func KafkaConnectToConsoleCloudEventsConverterHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	for _, prefix := range []string{"key", "value"} {
		cloudEventsSelected := false
		importance := model.ConfigDefinitionImportanceLow
		for _, config := range response.Configs {
			if config.Value.Name == prefix+".converter" {
				cloudEventsSelected = config.Value.Value == "io.debezium.converters.CloudEventsConverter"
				importance = config.Definition.Importance
			}
		}

		serializerTypePropertyName := prefix + ".converter.serializer.type"
		response.Configs = append(response.Configs, model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          serializerTypePropertyName,
				Type:          "STRING",
				DefaultValue:  "json",
				Importance:    importance,
				Required:      false,
				DisplayName:   "Message " + prefix + " serializer type",
				Documentation: "The encoding type to use for the CloudEvents envelope structure",
			},
			Value: model.ConfigDefinitionValue{
				Name:              serializerTypePropertyName,
				Value:             getPropertyValueFromConfig(serializerTypePropertyName, config, "json"),
				RecommendedValues: []string{},
				Visible:           cloudEventsSelected,
				Errors:            []string{},
			},
			Metadata: model.ConfigDefinitionMetadata{
				ComponentType: model.ComponentRadioGroup,
				RecommendedValues: []model.RecommendedValueWithMetadata{
					{Value: "avro", DisplayName: "AVRO"},
					{Value: "json", DisplayName: "JSON"},
				},
			},
		})

		dataSerializerTypePropertyName := prefix + ".converter.data.serializer.type"
		dataSerializerTypeValue := getPropertyValueFromConfig(dataSerializerTypePropertyName, config, "json")
		response.Configs = append(response.Configs, model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          dataSerializerTypePropertyName,
				Type:          "STRING",
				DefaultValue:  "json",
				Importance:    importance,
				Required:      false,
				DisplayName:   "Message " + prefix + " data serializer type",
				Documentation: "The encoding type to use for the data attribute",
			},
			Value: model.ConfigDefinitionValue{
				Name:              dataSerializerTypePropertyName,
				Value:             dataSerializerTypeValue,
				RecommendedValues: []string{},
				Visible:           cloudEventsSelected,
				Errors:            []string{},
			},
			Metadata: model.ConfigDefinitionMetadata{
				ComponentType: model.ComponentRadioGroup,
				RecommendedValues: []model.RecommendedValueWithMetadata{
					{Value: "avro", DisplayName: "AVRO"},
					{Value: "json", DisplayName: "JSON"},
				},
			},
		})

		jsonSchemasEnableVisible := cloudEventsSelected && dataSerializerTypeValue == "json"
		jsonSchemasEnablePropertyName := prefix + ".converter.json.schemas.enable"
		response.Configs = append(response.Configs, model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          jsonSchemasEnablePropertyName,
				Type:          "BOOLEAN",
				DefaultValue:  "true",
				Importance:    importance,
				Required:      false,
				DisplayName:   "Message " + prefix + " CloudEvents JSON contains schema",
				Documentation: "Whether your message " + prefix + " contains schema in the schema field",
			},
			Value: model.ConfigDefinitionValue{
				Name:              jsonSchemasEnablePropertyName,
				Value:             getPropertyValueFromConfig(jsonSchemasEnablePropertyName, config, "true"),
				RecommendedValues: []string{"true", "false"},
				Visible:           jsonSchemasEnableVisible,
				Errors:            []string{},
			},
		})
	}

	return response
}

func getPropertyValueFromConfig(name string, configs map[string]any, defaultValue string) any {
	config, exists := configs[name]
	if exists {
		return config
	}

	return defaultValue
}
