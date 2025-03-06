package serde

import (
	"reflect"

	"github.com/twmb/franz-go/pkg/kgo"
)

type Header struct {
	Key   string
	Value []byte
}

// SchemaInfo holds only the relevant headers:
// 'key.encoding', 'value.encoding', 'protobuf.type.value', 'protobuf.type.key'
type SchemaInfo struct {
	KeyEncoding       string `header:"key.encoding"`
	ValueEncoding     string `header:"value.encoding"`
	ProtobufTypeKey   string `header:"protobuf.type.key"`
	ProtobufTypeValue string `header:"protobuf.type.value"`
}

// getSchemaInfoFromHeaders maps headers to SchemaInfo fields using reflection and type handlers
func getSchemaInfoFromHeaders(record *kgo.Record) (SchemaInfo, error) {
	var info SchemaInfo
	// reflect.Value of the *SchemaInfo struct (pointer -> Elem).
	infoVal := reflect.ValueOf(&info).Elem()
	infoType := infoVal.Type()

	// We’ll build a lookup map: "headerKey" -> (fieldIndex in the struct)
	// by scanning the struct fields.
	fieldIndexByTag := make(map[string]int)
	for i := 0; i < infoVal.NumField(); i++ {
		field := infoType.Field(i)
		tagValue := field.Tag.Get("header")
		if tagValue != "" {
			fieldIndexByTag[tagValue] = i
		}
	}

	// Now loop over actual headers. If a header key matches any tag,
	// set the corresponding field to string(h.Value).
	for _, h := range record.Headers {
		if fieldIndex, ok := fieldIndexByTag[h.Key]; ok {
			f := infoVal.Field(fieldIndex)
			// Check that the field is settable and is a string kind
			if f.CanSet() && f.Kind() == reflect.String {
				f.SetString(string(h.Value))
			}
		}
	}

	return info, nil
}
