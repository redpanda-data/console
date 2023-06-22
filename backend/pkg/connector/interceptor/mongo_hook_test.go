package interceptor

import (
	"reflect"
	"testing"
)

func TestConsoleToKafkaConnectMongoDBHook(t *testing.T) {
	tests := []struct {
		name   string
		config map[string]any
		want   map[string]any
	}{
		{
			name: "Should construct connection.uri from UI wizard",
			config: map[string]any{
				"connection.url":       "mongodb+srv://cluster0.abcd.mongodb.net",
				"connection.username":  "user",
				"connection.password":  "${secretsManager:connector:connection.password}",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
			want: map[string]any{
				"connection.uri":       "mongodb+srv://user:${secretsManager:connector:connection.password}@cluster0.abcd.mongodb.net",
				"connection.url":       "mongodb+srv://cluster0.abcd.mongodb.net",
				"connection.username":  "user",
				"connection.password":  "${secretsManager:connector:connection.password}",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
		},
		{
			name: "Should construct connection.uri from UI wizard when secrets manager disabled",
			config: map[string]any{
				"connection.url":       "mongodb+srv://cluster0.abcd.mongodb.net",
				"connection.username":  "user",
				"connection.password":  "pswd",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
			want: map[string]any{
				"connection.uri":       "mongodb+srv://user:pswd@cluster0.abcd.mongodb.net",
				"connection.url":       "mongodb+srv://cluster0.abcd.mongodb.net",
				"connection.username":  "user",
				"connection.password":  "pswd",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
		},
		{
			name: "Should be able to update password when created outside of UI with secret manager",
			config: map[string]any{
				"connection.uri":       "mongodb+srv://user:${secretsManager:connector-1:connection.password}@cluster0.abcd.mongodb.net",
				"connection.username":  "user",
				"connection.password":  "${secretsManager:connector-2:connection.password}",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
			want: map[string]any{
				"connection.uri":       "mongodb+srv://user:${secretsManager:connector-2:connection.password}@cluster0.abcd.mongodb.net",
				"connection.url":       "mongodb+srv://cluster0.abcd.mongodb.net",
				"connection.username":  "user",
				"connection.password":  "${secretsManager:connector-2:connection.password}",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
		},
		{
			name: "Should be able to update password when created outside of UI without secret manager",
			config: map[string]any{
				"connection.uri":       "mongodb+srv://user:pswd@cluster0.abcd.mongodb.net",
				"connection.username":  "user",
				"connection.password":  "${secretsManager:connector-2:connection.password}",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
			want: map[string]any{
				"connection.uri":       "mongodb+srv://user:${secretsManager:connector-2:connection.password}@cluster0.abcd.mongodb.net",
				"connection.url":       "mongodb+srv://cluster0.abcd.mongodb.net",
				"connection.username":  "user",
				"connection.password":  "${secretsManager:connector-2:connection.password}",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
		},
		{
			name: "Should be able to update password when created outside of UI when secret managet disabled",
			config: map[string]any{
				"connection.uri":       "mongodb+srv://user:pswd@cluster0.abcd.mongodb.net",
				"connection.username":  "user",
				"connection.password":  "pswd2",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
			want: map[string]any{
				"connection.uri":       "mongodb+srv://user:pswd2@cluster0.abcd.mongodb.net",
				"connection.url":       "mongodb+srv://cluster0.abcd.mongodb.net",
				"connection.username":  "user",
				"connection.password":  "pswd2",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
		},
		{
			name:   "Should fill basic URI prefix for empty config",
			config: map[string]any{},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
		},
		{
			name: "Should pass post.processor.chain when available",
			config: map[string]any{
				"post.processor.chain": "PostProcessorChain",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "PostProcessorChain",
			},
		},
		{
			name:   "Should fill post.processor.chain when not available",
			config: map[string]any{},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder",
			},
		},
		{
			name: "Should add post.processor.chain for key.projection.type allowlist when not given already",
			config: map[string]any{
				"key.projection.type": "allowlist",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"key.projection.type":  "allowlist",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder,com.mongodb.kafka.connect.sink.processor.AllowListKeyProjector",
			},
		},
		{
			name: "Should not add another post.processor.chain for key.projection.type allowlist when given already",
			config: map[string]any{
				"key.projection.type":  "allowlist",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder,com.mongodb.kafka.connect.sink.processor.AllowListKeyProjector",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"key.projection.type":  "allowlist",
				"post.processor.chain": "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder,com.mongodb.kafka.connect.sink.processor.AllowListKeyProjector",
			},
		},
		{
			name: "Should add post.processor.chain for key.projection.type blocklist when not given already",
			config: map[string]any{
				"key.projection.type":  "blocklist",
				"post.processor.chain": "Any",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"key.projection.type":  "blocklist",
				"post.processor.chain": "Any,com.mongodb.kafka.connect.sink.processor.BlockListKeyProjector",
			},
		},
		{
			name: "Should not add another post.processor.chain for key.projection.type blocklist when given already",
			config: map[string]any{
				"key.projection.type":  "blocklist",
				"post.processor.chain": "Any,com.mongodb.kafka.connect.sink.processor.BlockListKeyProjector",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"key.projection.type":  "blocklist",
				"post.processor.chain": "Any,com.mongodb.kafka.connect.sink.processor.BlockListKeyProjector",
			},
		},
		{
			name: "Should add post.processor.chain for value.projection.type allowlist when not given already",
			config: map[string]any{
				"value.projection.type": "allowlist",
				"post.processor.chain":  "Any",
			},
			want: map[string]any{
				"connection.uri":        "mongodb://",
				"connection.url":        "mongodb://",
				"value.projection.type": "allowlist",
				"post.processor.chain":  "Any,com.mongodb.kafka.connect.sink.processor.AllowListValueProjector",
			},
		},
		{
			name: "Should not add another post.processor.chain for key.projection.type allowlist when given already",
			config: map[string]any{
				"value.projection.type": "allowlist",
				"post.processor.chain":  "com.mongodb.kafka.connect.sink.processor.AllowListValueProjector,Any",
			},
			want: map[string]any{
				"connection.uri":        "mongodb://",
				"connection.url":        "mongodb://",
				"value.projection.type": "allowlist",
				"post.processor.chain":  "com.mongodb.kafka.connect.sink.processor.AllowListValueProjector,Any",
			},
		},
		{
			name: "Should add post.processor.chain for value.projection.type blocklist when not given already",
			config: map[string]any{
				"value.projection.type": "blocklist",
				"post.processor.chain":  "Any",
			},
			want: map[string]any{
				"connection.uri":        "mongodb://",
				"connection.url":        "mongodb://",
				"value.projection.type": "blocklist",
				"post.processor.chain":  "Any,com.mongodb.kafka.connect.sink.processor.BlockListValueProjector",
			},
		},
		{
			name: "Should not add another post.processor.chain for key.projection.type blocklist when given already",
			config: map[string]any{
				"value.projection.type": "blocklist",
				"post.processor.chain":  "com.mongodb.kafka.connect.sink.processor.BlockListValueProjector",
			},
			want: map[string]any{
				"connection.uri":        "mongodb://",
				"connection.url":        "mongodb://",
				"value.projection.type": "blocklist",
				"post.processor.chain":  "com.mongodb.kafka.connect.sink.processor.BlockListValueProjector",
			},
		},
		{
			name: "Should add post.processor.chain for field.renamer.mapping when not given already",
			config: map[string]any{
				"field.renamer.mapping": "[{\"oldName\":\"key.COUNTRYCODE\",\"newName\":\"CountryCode\"}]",
				"post.processor.chain":  "Any",
			},
			want: map[string]any{
				"connection.uri":        "mongodb://",
				"connection.url":        "mongodb://",
				"field.renamer.mapping": "[{\"oldName\":\"key.COUNTRYCODE\",\"newName\":\"CountryCode\"}]",
				"post.processor.chain":  "Any,com.mongodb.kafka.connect.sink.processor.field.renaming.RenameByMapping",
			},
		},
		{
			name: "Should not add post.processor.chain for field.renamer.mapping when given already",
			config: map[string]any{
				"field.renamer.mapping": "[{\"oldName\":\"key.COUNTRYCODE\",\"newName\":\"CountryCode\"}]",
				"post.processor.chain":  "com.mongodb.kafka.connect.sink.processor.field.renaming.RenameByMapping",
			},
			want: map[string]any{
				"connection.uri":        "mongodb://",
				"connection.url":        "mongodb://",
				"field.renamer.mapping": "[{\"oldName\":\"key.COUNTRYCODE\",\"newName\":\"CountryCode\"}]",
				"post.processor.chain":  "com.mongodb.kafka.connect.sink.processor.field.renaming.RenameByMapping",
			},
		},
		{
			name: "Should not add post.processor.chain for field.renamer.mapping for empty field.renamer.mapping",
			config: map[string]any{
				"field.renamer.mapping": "[]",
				"post.processor.chain":  "Any",
			},
			want: map[string]any{
				"connection.uri":        "mongodb://",
				"connection.url":        "mongodb://",
				"field.renamer.mapping": "[]",
				"post.processor.chain":  "Any",
			},
		},
		{
			name: "Should not override output.format.key for JsonConverter if set",
			config: map[string]any{
				"post.processor.chain": "Any",
				"key.converter":        "org.apache.kafka.connect.json.JsonConverter",
				"output.format.key":    "json",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "Any",
				"key.converter":        "org.apache.kafka.connect.json.JsonConverter",
				"output.format.key":    "json",
			},
		},
		{
			name: "Should set output.format.key for JsonConverter if not set",
			config: map[string]any{
				"post.processor.chain": "Any",
				"key.converter":        "org.apache.kafka.connect.json.JsonConverter",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "Any",
				"key.converter":        "org.apache.kafka.connect.json.JsonConverter",
				"output.format.key":    "schema",
			},
		},
		{
			name: "Should set output.format.key for AvroConverter if not set",
			config: map[string]any{
				"post.processor.chain": "Any",
				"key.converter":        "io.confluent.connect.avro.AvroConverter",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "Any",
				"key.converter":        "io.confluent.connect.avro.AvroConverter",
				"output.format.key":    "schema",
			},
		},
		{
			name: "Should set output.format.key for StringConverter if not set",
			config: map[string]any{
				"post.processor.chain": "Any",
				"key.converter":        "org.apache.kafka.connect.storage.StringConverter",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "Any",
				"key.converter":        "org.apache.kafka.connect.storage.StringConverter",
				"output.format.key":    "json",
			},
		},
		{
			name: "Should set output.format.key for ByteArrayConverter if not set",
			config: map[string]any{
				"post.processor.chain": "Any",
				"key.converter":        "org.apache.kafka.connect.converters.ByteArrayConverter",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "Any",
				"key.converter":        "org.apache.kafka.connect.converters.ByteArrayConverter",
				"output.format.key":    "bson",
			},
		},
		{
			name: "Should not override output.format.value for JsonConverter if set",
			config: map[string]any{
				"post.processor.chain": "Any",
				"value.converter":      "org.apache.kafka.connect.json.JsonConverter",
				"output.format.value":  "json",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "Any",
				"value.converter":      "org.apache.kafka.connect.json.JsonConverter",
				"output.format.value":  "json",
			},
		},
		{
			name: "Should set output.format.value for JsonConverter if not set",
			config: map[string]any{
				"post.processor.chain": "Any",
				"value.converter":      "org.apache.kafka.connect.json.JsonConverter",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "Any",
				"value.converter":      "org.apache.kafka.connect.json.JsonConverter",
				"output.format.value":  "schema",
			},
		},
		{
			name: "Should set output.format.value for AvroConverter if not set",
			config: map[string]any{
				"post.processor.chain": "Any",
				"value.converter":      "io.confluent.connect.avro.AvroConverter",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "Any",
				"value.converter":      "io.confluent.connect.avro.AvroConverter",
				"output.format.value":  "schema",
			},
		},
		{
			name: "Should set output.format.value for StringConverter if not set",
			config: map[string]any{
				"post.processor.chain": "Any",
				"value.converter":      "org.apache.kafka.connect.storage.StringConverter",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "Any",
				"value.converter":      "org.apache.kafka.connect.storage.StringConverter",
				"output.format.value":  "json",
			},
		},
		{
			name: "Should set output.format.value for ByteArrayConverter if not set",
			config: map[string]any{
				"post.processor.chain": "Any",
				"value.converter":      "org.apache.kafka.connect.converters.ByteArrayConverter",
			},
			want: map[string]any{
				"connection.uri":       "mongodb://",
				"connection.url":       "mongodb://",
				"post.processor.chain": "Any",
				"value.converter":      "org.apache.kafka.connect.converters.ByteArrayConverter",
				"output.format.value":  "bson",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ConsoleToKafkaConnectMongoDBHook(tt.config); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("ConsoleToKafkaConnectMongoDBHook() = %v, want %v", got, tt.want)
			}
		})
	}
}
