package interceptor

import (
	"fmt"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

// KafkaConnectToConsoleAvroCodecHook makes 'avro.codec' property visible if avro output format is selected
// and hidden if other format type is selected
func KafkaConnectToConsoleAvroCodecHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	indexOfAvroCodec := getIndexOfProperty(response, "avro.codec")
	if indexOfAvroCodec > -1 {
		isAvroOutputFormat := fmt.Sprintf("%v", config["format.output.type"]) == "avro"
		response.Configs[indexOfAvroCodec].Value.Visible = isAvroOutputFormat
	}
	return response
}

func getIndexOfProperty(response model.ValidationResponse, name string) int {
	for i := range response.Configs {
		if response.Configs[i].Value.Name == name {
			return i
		}
	}
	return -1
}
