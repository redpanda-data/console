package kafka

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	xj "github.com/basgys/goxml2json"
	"github.com/cloudhut/kowl/backend/pkg/schema"
	"strings"
	"unicode/utf8"
)

// deserializer can deserialize messages from various formats (json, xml, avro, ..) into a Go native form.
type deserializer struct {
	SchemaService *schema.Service
}

type messageEncoding string

const (
	messageEncodingNone   messageEncoding = "none"
	messageEncodingAvro   messageEncoding = "avro"
	messageEncodingJSON   messageEncoding = "json"
	messageEncodingXML    messageEncoding = "xml"
	messageEncodingText   messageEncoding = "text"
	messageEncodingBinary messageEncoding = "binary"
)

type deserializedPayload struct {
	// NormalizedPayload is the original payload except for all message encodings which can be converted to a JSON object
	NormalizedPayload []byte

	// Object is the parsed version of the payload. This will be passed to the JavaScript interpreter
	Object             interface{}
	RecognizedEncoding messageEncoding
}

// MarshalJSON implements the 'Marshaller' interface for deserialized payload.
// We do this because we want to pass the deserialized payload as JavaScript object (regardless of the type) to the frontend.
func (d *deserializedPayload) MarshalJSON() ([]byte, error) {
	switch d.RecognizedEncoding {
	case messageEncodingNone:
		return []byte("{}"), nil
	case messageEncodingText:
		return json.Marshal(string(d.NormalizedPayload))
	case messageEncodingBinary:
		b64 := base64.StdEncoding.EncodeToString(d.NormalizedPayload)
		return json.Marshal(b64)
	default:
		return d.NormalizedPayload, nil
	}
}

// DeserializePayload tries to deserialize a given byte array.
// The payload's byte array may represent
//  - an encoded message such as JSON, Avro or XML
//  - UTF-8 Text
//  - Binary content
// Idea: Add encoding hint where user can suggest the backend to test this encoding first.
func (d *deserializer) DeserializePayload(payload []byte) *deserializedPayload {
	if len(payload) == 0 {
		return &deserializedPayload{NormalizedPayload: payload, Object: "", RecognizedEncoding: messageEncodingNone}
	}

	// 1. Test for Avro (reference: https://docs.confluent.io/current/schema-registry/serdes-develop/index.html#wire-format)
	if d.SchemaService != nil && len(payload) > 5 {
		// Check if magic byte is set
		if payload[0] == byte(0) {
			schemaID := binary.BigEndian.Uint32(payload[1:5])
			codec, err := d.SchemaService.GetAvroSchemaByID(schemaID)
			if err == nil {
				native, _, err := codec.NativeFromBinary(payload[5:])
				if err == nil {
					normalized, _ := json.Marshal(native)
					return &deserializedPayload{NormalizedPayload: normalized, Object: native, RecognizedEncoding: messageEncodingAvro}
				}
			}
		}
	}

	trimmed := bytes.TrimLeft(payload, " \t\r\n")
	if len(trimmed) == 0 {
		return &deserializedPayload{NormalizedPayload: payload, Object: string(payload), RecognizedEncoding: messageEncodingText}
	}

	// 2. Test for valid JSON
	startsWithJSON := trimmed[0] == '[' || trimmed[0] == '{'
	if startsWithJSON {
		var obj interface{}
		err := json.Unmarshal(payload, &obj)
		if err == nil {
			return &deserializedPayload{NormalizedPayload: trimmed, Object: obj, RecognizedEncoding: messageEncodingJSON}
		}
	}

	// 3. Test for valid XML
	startsWithXML := trimmed[0] == '<'
	if startsWithXML {
		r := strings.NewReader(string(trimmed))
		jsonPayload, err := xj.Convert(r)
		if err == nil {
			var obj interface{}
			_ = json.Unmarshal(jsonPayload.Bytes(), &obj) // no err possible unless the xml2json package is buggy
			return &deserializedPayload{NormalizedPayload: jsonPayload.Bytes(), Object: obj, RecognizedEncoding: messageEncodingXML}
		}
	}

	// 4. Test for UTF-8 validity
	isUTF8 := utf8.Valid(payload)
	if isUTF8 {
		return &deserializedPayload{NormalizedPayload: payload, Object: string(payload), RecognizedEncoding: messageEncodingText}
	}

	// Anything else is considered as binary content
	return &deserializedPayload{NormalizedPayload: payload, Object: payload, RecognizedEncoding: messageEncodingBinary}
}
