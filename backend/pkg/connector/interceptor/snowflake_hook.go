package interceptor

import (
	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

func KafkaConnectToConsoleSnowflakeHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {

	ingestion, err := getConfig(response, "snowflake.ingestion.method")
	if err != nil {
		return response
	}

	converter, err := getConfig(response, "value.converter")
	if err != nil {
		return response
	}

	if response.Configs[ingestion].Value.Value == "snowpipe_streaming" && response.Configs[converter].Value.Value != "org.apache.kafka.connect.storage.StringConverter" {
		response.Configs[converter].Value.Errors = append(response.Configs[converter].Value.Errors, "For SNOWPIPE_STREAMING only STRING converter can be used")
	}

	return response
}

func getConfig(response model.ValidationResponse, name string) (int, error) {
	for i, config := range response.Configs {
		if config.Value.Name == name {
			return i, nil
		}
	}
	return 0, nil
}
