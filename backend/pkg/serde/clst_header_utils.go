package serde

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"reflect"
	"strings"
	"sync"

	"github.com/twmb/franz-go/pkg/kgo"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	descriptorpb "google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

const jsonFieldFileDescriptor = "fileDescriptorSet"

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

type Config struct {
	Mappings map[string]string `yaml:"mappings"`
}

var nameToModule = map[string]string{
	"apollo.bk.v1.TransactionKey":                       "fleet/bk",
	"apollo.bk.v1.Transaction":                          "fleet/bk",
	"apollo.bk.v1.TransactionEnvelope":                  "fleet/bk",
	"apollo.bk.v1.Event":                                "fleet/bk",
	"apollo.bk.v1.SodCheckpointEvent":                   "fleet/bk",
	"apollo.bk.v1.TradeCreatedEvent":                    "fleet/bk",
	"apollo.bkload.v1alpha1.MarkersComplete":            "fleet/bkload",
	"apollo.secfin.v1beta3.RepoEvent":                   "fleet/secfin",
	"apollo.secfin.v1.InternalEvent":                    "fleet/secfin",
	"apollo.secfin.v1.Event":                            "fleet/secfin",
	"apollo.secfin.v2.Event":                            "fleet/secfin",
	"apollo.secfin.v2.InternalEvent":                    "fleet/secfin",
	"apollo.obligations.v1.Event":                       "fleet/obligations",
	"apollo.obligations.v1.InternalEvent":               "fleet/obligations",
	"phoenix.basis.v1.Eodeconomic":                      "fleet/basis",
	"phoenix.basis.v1.Eodposition":                      "fleet/basis",
	"pmaggregate.v1alpha1.PmAggregatedResultPayload":    "fleet/pm-aggregator",
	"pmaggregate.v1alpha1.PmAggregatedResultKeyPayload": "fleet/pm-aggregator",
	"mmresults.v1alpha1.MmResultKeyPayload":             "fleet/pm-aggregator",
	"mmresults.v1alpha1.MmResultPayload":                "fleet/pm-aggregator",
	"mmresults.v1alpha1.MmResultPayloadV2":              "fleet/pm-aggregator",
	"riskmeasures.v1alpha1.InstrumentPriceKeyPayload":   "fleet/risk-measures",
	"riskmeasures.v1alpha1.InstrumentPricePayload":      "fleet/risk-measures",
	"luna.session.v1beta1.UnitKey":                      "fleet/protocol",
	"luna.session.v1beta1.CalculationUnit":              "fleet/protocol",
	"luna.session.v1beta1.CalculationSession":           "fleet/protocol",
	"md.bbo.v1alpha1.Bbo":                               "fleet/mad",
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
	for _, h := range record.Headers {
		if fieldIndex, ok := fieldIndexByTag[h.Key]; ok {
			field := infoVal.Field(fieldIndex)
			// Check that the field is settable and is a string kind
			if field.CanSet() && field.Kind() == reflect.String {
				field.SetString(string(h.Value))
			}
		}
	}

	// Check if key and value are valid format
	// e.g: "apollo.bk.v1.TransactionKey"
	// if !isValidType(info.ProtobufTypeKey) {
	// 	return info, fmt.Errorf("invalid proto type key: %v", info.ProtobufTypeKey)
	// }

	// if !isValidType(info.ProtobufTypeValue) {
	// 	return info, fmt.Errorf("invalid proto type value: %v", info.ProtobufTypeValue)
	// }

	return info, nil
}

/*
*
*	module: Module in the BSR
*		Example: "module": "clst.buf.team/fleet/bk"
* version:	Version of the module
*		Example: "version": "75b4300737fb4efca0831636be94e517"
*	symbols: An array of fully qualified names of proto Messages and Enums
*		Example:"symbols": ["apollo.bk.v1.TransactionKey"]
*
*	Full Example:
* '{
*				"module": "clst.buf.team/fleet/bk",
*				"version": "75b4300737fb4efca0831636be94e517",
* 			"symbols": ["apollo.bk.v1.TransactionKey"]
*		}'
*
 */
func getMessageDescriptor(module string, version string, symbols []string, fullyQualifiedName string) (protoreflect.MessageDescriptor, error) {

	requestMap := map[string]interface{}{
		"module":  module,
		"version": version,
		"symbols": symbols,
	}

	// To be put on config
	token := "5bbe858e4594d1dc08dc1b558f05a624e77e75e6f0477cc2b11c9986a78b0917"
	jsonReq, err := json.Marshal(requestMap)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := "https://clst.buf.team/buf.reflect.v1beta1.FileDescriptorSetService/GetFileDescriptorSet"
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonReq))
	if err != nil {
		return nil, fmt.Errorf("failed to create POST request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Connect-Protocol-Version", "1")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("POST request error: %w", err)
	}
	defer resp.Body.Close()

	response, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response body error: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("non-2xx status code %d: %s", resp.StatusCode, string(response))
	}

	// fmt.Printf("FileDescResponse: %+v \n\n", response)
	var rawMessage map[string]json.RawMessage
	if err := json.Unmarshal(response, &rawMessage); err != nil {
		return nil, fmt.Errorf("failed to unmarshal top-level JSON: %w", err)
	}

	rawFileDesceiptor, ok := rawMessage[jsonFieldFileDescriptor]
	if !ok {
		return nil, fmt.Errorf("missing fileDescriptorSet key in JSON")
	}
	var unmarshalOptions = protojson.UnmarshalOptions{
		DiscardUnknown: true, // This prevents failures due to unknown fields
	}
	var fileDescriptor descriptorpb.FileDescriptorSet
	if err := unmarshalOptions.Unmarshal(rawFileDesceiptor, &fileDescriptor); err != nil {
		return nil, fmt.Errorf("protojson unmarshal: %w", err)
	}

	files, err := protodesc.NewFiles(&fileDescriptor)
	if err != nil {
		return nil, fmt.Errorf("failed to convert FileDescriptorSet -> protodesc.Files: %w", err)
	}

	fullName := protoreflect.FullName(fullyQualifiedName)
	// desc, err := files.FindDescriptorByName(fullName)
	desc, err := files.FindDescriptorByName(fullName)
	if err != nil {
		return nil, fmt.Errorf("could not find descriptor for %q: %w", fullName, err)
	}

	msgDesc, ok := desc.(protoreflect.MessageDescriptor)
	if !ok {
		return nil, fmt.Errorf("descriptor for %q is not a message descriptor", fullName)
	}

	return msgDesc, nil
}

func payloadForValue(payloadType PayloadType) bool {
	return payloadType == PayloadTypeValue
}

func getModule(fullName string) string {
	base := "clst.buf.team/"
	return base + nameToModule[fullName]
}

// To inspect ray []byte json
func inspectRawProtobuf(data []byte, indent string) {
	r := bytes.NewReader(data)
	readBytes := func() []byte {
		return data[len(data)-r.Len():]
	}
	for r.Len() > 0 {
		tag, wireType, n := protowire.ConsumeTag(readBytes())
		if n < 0 {
			log.Printf("Failed to parse tag: %v", n)
			return
		}
		r.Seek(int64(n), 1)

		var value any
		var innerBytes []byte
		switch wireType {
		case protowire.VarintType:
			v, m := protowire.ConsumeVarint(readBytes())
			if m < 0 {
				log.Printf("Failed to parse varint: %v", m)
				return
			}
			value = v
			r.Seek(int64(m), 1)
		case protowire.Fixed32Type:
			v, m := protowire.ConsumeFixed32(readBytes())
			if m < 0 {
				log.Printf("Failed to parse fixed32: %v", m)
				return
			}
			value = v
			r.Seek(int64(m), 1)
		case protowire.Fixed64Type:
			v, m := protowire.ConsumeFixed64(readBytes())
			if m < 0 {
				log.Printf("Failed to parse fixed64: %v", m)
				return
			}
			value = v
			r.Seek(int64(m), 1)
		case protowire.BytesType:
			v, m := protowire.ConsumeBytes(readBytes())
			if m < 0 {
				log.Printf("Failed to parse bytes: %v", m)
				return
			}
			value = hex.EncodeToString(v) // Print bytes as hex
			r.Seek(int64(m), 1)
			innerBytes = v
		default:
			log.Printf("Unknown wire type: %v", wireType)
			return
		}

		fmt.Printf(indent+"Tag: %d, WireType: %d, Value: %v\n", tag, wireType, value)
		if innerBytes != nil {
			inspectRawProtobuf(innerBytes, indent+"  ")
		}
	}
}

func fixKeys(jsonBytes []byte) []byte {
	fixed := bytes.ReplaceAll(jsonBytes, []byte("type.clearstreet.io/"), []byte(""))
	fixed = bytes.ReplaceAll(fixed, []byte("type.googleapis.com/"), []byte(""))
	return fixed
}

// **Fix the type URL inside a google.protobuf.Any field**
func fixAnyTypeURL(dynamicAny *dynamicpb.Message) {
	const badPrefix = "type.clearstreet.io/"
	const correctPrefix = ""

	// Extract "type_url" field manually
	typeURLField := dynamicAny.Descriptor().Fields().ByName("type_url")
	if typeURLField == nil {
		fmt.Println("Invalid Any message structure: no type_url field found")
		return
	}

	typeURL := dynamicAny.Get(typeURLField).String()

	// Fix type_url if it starts with the wrong prefix
	if strings.HasPrefix(typeURL, badPrefix) {
		newTypeURL := correctPrefix + strings.TrimPrefix(typeURL, badPrefix)
		dynamicAny.Set(typeURLField, protoreflect.ValueOfString(newTypeURL))
		fmt.Println("Fixed TypeURL:", typeURL)
	}
}

// **Recursively fix all google.protobuf.Any fields in a message**
func fixAnyFields(msg *dynamicpb.Message) {
	// msgReflect := msg.ProtoReflect()
	// **Iterate Over Fields & Handle `Any` Fields Separately**
	msg.ProtoReflect().Range(func(fd protoreflect.FieldDescriptor, value protoreflect.Value) bool {
		if fd.Message() != nil {
			fullN := string(fd.Message().FullName())
			if fullN == "google.protobuf.Any" {
				anyDescriptor := fd.Message() // Get the descriptor for `google.protobuf.Any`
				newAnyMessage := dynamicpb.NewMessage(anyDescriptor)

				// **Set type_url & value inside the new Any message**
				newAnyMessage.Set(anyDescriptor.Fields().ByName("type_url"), protoreflect.ValueOf(""))
				newAnyMessage.Set(anyDescriptor.Fields().ByName("value"), protoreflect.ValueOfBytes(nil))

				// **Assign modified Any back to the parent message**
				msg.ProtoReflect().Set(fd, protoreflect.ValueOfMessage(newAnyMessage))
			}
		}
		return true
	})
}

// **Fix google.protobuf.Any fields by updating TypeURL and decoding the inner message**
func fixAnyFieldsRecursive(msg *dynamicpb.Message) error {
	msgReflect := msg.ProtoReflect()

	msgReflect.Range(func(fd protoreflect.FieldDescriptor, value protoreflect.Value) bool {
		// **If the field is an Any message**
		if fd.Message() != nil && fd.Message().FullName() == "google.protobuf.Any" {
			// Extract the dynamic Any message
			dynamicAny := value.Message().Interface().(*dynamicpb.Message)

			fixAnyTypeURL(dynamicAny)

			// Extract updated type_url and value
			typeURLField := dynamicAny.Descriptor().Fields().ByName("type_url")
			valueField := dynamicAny.Descriptor().Fields().ByName("value")

			if typeURLField == nil || valueField == nil {
				fmt.Println("Invalid Any message structure")
				return true
			}

			typeURL := dynamicAny.Get(typeURLField).String()
			binaryValue := dynamicAny.Get(valueField).Bytes()

			module := getModule(typeURL)
			innerMsgDesc, err := getMessageDescriptorCacheing(module, "main", typeURL)
			if err != nil {
				fmt.Printf("Could not find descriptor for %s: %v\n", typeURL, err)
				return true // Continue processing other fields
			}

			// **Unmarshal the inner message**
			innerDynamicMsg := dynamicpb.NewMessage(innerMsgDesc.(protoreflect.MessageDescriptor))
			if err := proto.Unmarshal(binaryValue, innerDynamicMsg); err != nil {
				fmt.Printf("Failed to unmarshal Any payload: %v\n", err)
				return true
			}

			// **Replace the field with the fully decoded message**
			msgReflect.Set(fd, protoreflect.ValueOfMessage(innerDynamicMsg.ProtoReflect()))
		}

		// **Handle Nested Messages Recursively**
		if fd.Message() != nil {
			nestedMsg := value.Message().Interface().(*dynamicpb.Message)
			_ = fixAnyFieldsRecursive(nestedMsg)
		}

		return true // Continue iterating
	})

	return nil
}

// **Global cache for storing parsed message descriptors per module**
var descriptorCache sync.Map // map[string]map[string]protoreflect.MessageDescriptor

const jsonAllFileDescriptor = "fileDescriptorSet"

// **Fetch & Cache MessageDescriptor**
func getMessageDescriptorCacheing(module string, version string, fullyQualifiedName string) (protoreflect.MessageDescriptor, error) {
	cacheKey := fmt.Sprintf("%s|%s", module, version)

	// **Check if module's descriptors are already cached**
	if cached, found := descriptorCache.Load(cacheKey); found {
		fmt.Println("Using cached descriptors for:", cacheKey)
		messageDescriptors := cached.(map[string]protoreflect.MessageDescriptor)

		if md, exists := messageDescriptors[fullyQualifiedName]; exists {
			return md, nil
		}

		return nil, fmt.Errorf("message descriptor %q not found in cached module", fullyQualifiedName)
	}
	fmt.Println("Fetching FileDescriptorSet from Buf Reflect API:", cacheKey)

	requestMap := map[string]interface{}{
		"module":  module,
		"version": version,
	}

	// **Prepare API request**
	token := "5bbe858e4594d1dc08dc1b558f05a624e77e75e6f0477cc2b11c9986a78b0917" // Move to config
	jsonReq, err := json.Marshal(requestMap)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := "https://clst.buf.team/buf.reflect.v1beta1.FileDescriptorSetService/GetFileDescriptorSet"
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonReq))
	if err != nil {
		return nil, fmt.Errorf("failed to create POST request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Connect-Protocol-Version", "1")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("POST request error: %w", err)
	}
	defer resp.Body.Close()

	// **Read API response**
	response, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response body error: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("non-2xx status code %d: %s", resp.StatusCode, string(response))
	}

	var rawMessage map[string]json.RawMessage
	if err := json.Unmarshal(response, &rawMessage); err != nil {
		return nil, fmt.Errorf("failed to unmarshal top-level JSON: %w", err)
	}

	rawFileDescriptor, ok := rawMessage[jsonAllFileDescriptor]
	if !ok {
		return nil, fmt.Errorf("missing fileDescriptorSet key in JSON")
	}

	var unmarshalOptions = protojson.UnmarshalOptions{
		DiscardUnknown: true, // Prevents failures due to unknown fields
	}
	var fileDescriptor descriptorpb.FileDescriptorSet
	if err := unmarshalOptions.Unmarshal(rawFileDescriptor, &fileDescriptor); err != nil {
		return nil, fmt.Errorf("protojson unmarshal: %w", err)
	}

	// **Convert FileDescriptorSet into protodesc.Files**
	files, err := protodesc.NewFiles(&fileDescriptor)
	if err != nil {
		return nil, fmt.Errorf("failed to convert FileDescriptorSet -> protodesc.Files: %w", err)
	}

	// **Extract all message descriptors and cache them**
	messageDescriptors := make(map[string]protoreflect.MessageDescriptor)

	// Iterate over all file descriptors
	files.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		// Iterate over message types
		for i := 0; i < fd.Messages().Len(); i++ {
			md := fd.Messages().Get(i)
			fullName := string(md.FullName())
			messageDescriptors[fullName] = md
		}
		return true
	})

	// **Store in cache**
	descriptorCache.Store(cacheKey, messageDescriptors)

	// **Return requested descriptor**
	if md, exists := messageDescriptors[fullyQualifiedName]; exists {
		return md, nil
	}

	return nil, fmt.Errorf("message descriptor %q not found after fetching module", fullyQualifiedName)
}
