package serde

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"github.com/twmb/franz-go/pkg/kgo"
)

type HeaderPayload struct {
	Payload  string `json:"payload"`
	Encoding string `json:"encoding"`
}

// SchemaInfo holds only the relevant headers:
// 'key.encoding', 'value.encoding', 'protobuf.type.value', 'protobuf.type.key'
type SchemaInfo struct {
	KeyEncoding       string
	ValueEncoding     string
	ProtobufTypeKey   string
	ProtobufTypeValue string
}

// Mapping each header key to the corresponding field in SchemaInfo.
var onlyHeaders = map[string]string{
	"key.encoding":        "KeyEncoding",
	"value.encoding":      "ValueEncoding",
	"protobuf.type.key":   "ProtobufTypeKey",
	"protobuf.type.value": "ProtobufTypeValue",
}

// getSchemaInfoFromHeaders maps headers to SchemaInfo fields using reflection and type handlers
func getSchemaInfoFromHeaders(record *kgo.Record) (SchemaInfo, error) {
	fmt.Println("Extracting headers from record")
	var info SchemaInfo

	// We'll use reflection to set fields in SchemaInfo only for the headers we care about
	infoVal := reflect.ValueOf(&info).Elem()

	for _, h := range record.Headers {
		// If this header is not in our onlyHeaders map, skip
		fieldName, exists := onlyHeaders[h.Key]
		if !exists {
			continue
		}

		var headerPayload HeaderPayload
		if err := json.Unmarshal(h.Value, &headerPayload); err != nil {
			fmt.Printf("Skipping header %s due to unmarshal error: %v\n", h.Key, err)
			continue
		}

		// hp.Payload often has extra quotes, e.g. "proto"; let's strip them
		parsed := strings.Trim(headerPayload.Payload, "\"")

		// Set the field in SchemaInfo
		f := infoVal.FieldByName(fieldName)
		if f.IsValid() && f.CanSet() {
			// We only store string fields in SchemaInfo, so setString
			f.SetString(parsed)
		}
	}

	// No mandatory requirement except we skip schema_id here,
	// so we won't do a custom check. Return the info.
	fmt.Println("Final extracted SchemaInfo:", info)
	return info, nil
}
