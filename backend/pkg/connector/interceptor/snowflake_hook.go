package interceptor

import (
	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

func KafkaConnectToConsoleSnowflakeHook(response model.ValidationResponse, _ map[string]any) model.ValidationResponse {
	ingestion := getConfig(&response, "snowflake.ingestion.method")
	if ingestion == nil {
		return response
	}

	converter := getConfig(&response, "value.converter")
	if converter == nil {
		return response
	}

	if ingestion.Value.Value == "snowpipe_streaming" && converter.Value.Value != "org.apache.kafka.connect.storage.StringConverter" {
		converter.AddError("For SNOWPIPE_STREAMING only STRING converter can be used")
	}

	return response
}

func getConfig(response *model.ValidationResponse, name string) *model.ConfigDefinition {
	for i := range response.Configs {
		if response.Configs[i].Value.Name == name {
			return &response.Configs[i]
		}
	}
	return nil
}
