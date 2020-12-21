package kafka

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"strings"
	"unicode/utf8"

	xj "github.com/basgys/goxml2json"
	"github.com/cloudhut/kowl/backend/pkg/schema"
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

// normalizedPayload is a wrapper of the original message with the purpose of having a custom JSON marshal method
type normalizedPayload struct {
	// Payload is the original payload except for all message encodings which can be converted to a JSON object
	Payload            []byte
	RecognizedEncoding messageEncoding `json:"encoding"`
}

// MarshalJSON implements the 'Marshaller' interface for deserialized payload.
// We do this because we want to pass the deserialized payload as JavaScript object (regardless of the encoding) to the frontend.
func (d *normalizedPayload) MarshalJSON() ([]byte, error) {
	switch d.RecognizedEncoding {
	case messageEncodingNone:
		return []byte("{}"), nil
	case messageEncodingText:
		return json.Marshal(string(d.Payload))
	case messageEncodingBinary:
		b64 := base64.StdEncoding.EncodeToString(d.Payload)
		return json.Marshal(b64)
	default:
		return d.Payload, nil
	}
}

type deserializedPayload struct {
	Payload normalizedPayload `json:"payload"`

	// Object is the parsed version of the payload. This will be passed to the JavaScript interpreter
	Object             interface{}     `json:"-"`
	RecognizedEncoding messageEncoding `json:"encoding"`
	AvroSchemaID       uint32          `json:"avroSchemaId"`
	Size               int             `json:"size"` // number of 'raw' bytes
}

// DeserializePayload tries to deserialize a given byte array.
// The payload's byte array may represent
//  - an encoded message such as JSON, Avro or XML
//  - UTF-8 Text
//  - Binary content
// Idea: Add encoding hint where user can suggest the backend to test this encoding first.
func (d *deserializer) DeserializePayload(payload []byte) *deserializedPayload {
	if len(payload) == 0 {
		return &deserializedPayload{Payload: normalizedPayload{
			Payload:            payload,
			RecognizedEncoding: messageEncodingNone,
		}, Object: "", RecognizedEncoding: messageEncodingNone, Size: len(payload)}
	}

	trimmed := bytes.TrimLeft(payload, " \t\r\n")
	if len(trimmed) == 0 {
		return &deserializedPayload{Payload: normalizedPayload{
			Payload:            payload,
			RecognizedEncoding: messageEncodingText,
		}, Object: string(payload), RecognizedEncoding: messageEncodingText, Size: len(payload)}
	}

	// 1. Test for valid JSON
	startsWithJSON := trimmed[0] == '[' || trimmed[0] == '{'
	if startsWithJSON {
		var obj interface{}
		err := json.Unmarshal(payload, &obj)
		if err == nil {
			return &deserializedPayload{Payload: normalizedPayload{
				Payload:            trimmed,
				RecognizedEncoding: messageEncodingJSON,
			}, Object: obj, RecognizedEncoding: messageEncodingJSON, Size: len(payload)}
		}
	}

	// 2. Test for valid XML
	startsWithXML := trimmed[0] == '<'
	if startsWithXML {
		r := strings.NewReader(string(trimmed))
		jsonPayload, err := xj.Convert(r)
		if err == nil {
			var obj interface{}
			_ = json.Unmarshal(jsonPayload.Bytes(), &obj) // no err possible unless the xml2json package is buggy
			return &deserializedPayload{Payload: normalizedPayload{
				Payload:            jsonPayload.Bytes(),
				RecognizedEncoding: messageEncodingXML,
			}, Object: obj, RecognizedEncoding: messageEncodingXML, Size: len(payload)}
		}
	}

	// 3. Test for Avro (reference: https://docs.confluent.io/current/schema-registry/serdes-develop/index.html#wire-format)
	if d.SchemaService != nil && len(payload) > 5 {
		// Check if magic byte is set
		if payload[0] == byte(0) {
			schemaID := binary.BigEndian.Uint32(payload[1:5])
			codec, err := d.SchemaService.GetAvroSchemaByID(schemaID)
			if err == nil {
				native, _, err := codec.NativeFromBinary(payload[5:])
				if err == nil {
					normalized, _ := json.Marshal(native)
					return &deserializedPayload{
						Payload: normalizedPayload{
							Payload:            normalized,
							RecognizedEncoding: messageEncodingAvro,
						},
						Object:             native,
						RecognizedEncoding: messageEncodingAvro,
						AvroSchemaID:       schemaID,
						Size:               len(payload),
					}
				}
			}
		}
	}

	// 4. Test for UTF-8 validity
	isUTF8 := utf8.Valid(payload)
	if isUTF8 {
		return &deserializedPayload{Payload: normalizedPayload{
			Payload:            payload,
			RecognizedEncoding: messageEncodingText,
		}, Object: string(payload), RecognizedEncoding: messageEncodingText, Size: len(payload)}
	}

	// Anything else is considered as binary content
	return &deserializedPayload{Payload: normalizedPayload{
		Payload:            payload,
		RecognizedEncoding: messageEncodingBinary,
	}, Object: payload, RecognizedEncoding: messageEncodingBinary, Size: len(payload)}
}
