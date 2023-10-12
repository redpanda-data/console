package serde

import (
	"context"
	"encoding/binary"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
)

func TestUintSerde_DeserializePayload(t *testing.T) {
	serde := UintSerde{}

	numBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(numBytes, 1952807028)

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "number",
			record: &kgo.Record{
				Value: numBytes,
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingUint, payload.Encoding)

				val, ok := (payload.DeserializedPayload).(uint32)
				require.Truef(t, ok, "parsed payload is not of type uint32")
				assert.Equal(t, uint32(1952807028), val)

				assert.Equal(t, "1952807028", string(payload.NormalizedPayload))
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := serde.DeserializePayload(context.Background(), test.record, test.payloadType)
			test.validationFunc(t, *payload, err)
		})
	}
}

func TestUintSerde_SerializeObject(t *testing.T) {
	serde := UintSerde{}

	tests := []struct {
		name           string
		input          any
		payloadType    PayloadType
		options        []SerdeOpt
		validationFunc func(*testing.T, []byte, error)
	}{
		{
			name:        "empty byte",
			input:       []byte(""),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Nil(t, res)
				assert.Equal(t, "string payload is empty", err.Error())
			},
		},
		{
			name:        "empty after trimming",
			input:       []byte("\t"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Nil(t, res)
				assert.Equal(t, "string payload is empty", err.Error())
			},
		},
		{
			name:        "not parsable",
			input:       []byte("text"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Nil(t, res)
				assert.Equal(t, `failed to encode uint payload: strconv.ParseUint: parsing "text": invalid syntax`, err.Error())
			},
		},
		{
			name:        "parsable text",
			input:       []byte("123"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)

				numBytes := make([]byte, 8)
				binary.BigEndian.PutUint64(numBytes, 123)

				assert.Equal(t, numBytes, res)
			},
		},
		{
			name:        "parsable string text",
			input:       "321",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)

				numBytes := make([]byte, 8)
				binary.BigEndian.PutUint64(numBytes, 321)

				assert.Equal(t, numBytes, res)
			},
		},
		{
			name:        "parsable string text with option",
			input:       "111",
			payloadType: PayloadTypeValue,
			options:     []SerdeOpt{WithUintSize(Uint32)},
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)

				numBytes := make([]byte, 4)
				binary.BigEndian.PutUint32(numBytes, 111)

				assert.Equal(t, numBytes, res)
			},
		},
		{
			name:        "uint32",
			input:       uint32(333),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)

				numBytes := make([]byte, 4)
				binary.BigEndian.PutUint32(numBytes, 333)

				assert.Equal(t, numBytes, res)
			},
		},
		{
			name:        "uint",
			input:       uint(444),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)

				numBytes := make([]byte, 8)
				binary.BigEndian.PutUint64(numBytes, 444)

				assert.Equal(t, numBytes, res)
			},
		},
		{
			name:        "invalid int",
			input:       234,
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Nil(t, res)
				assert.Equal(t, "unsupported type int for uint serialization", err.Error())
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			data, err := serde.SerializeObject(context.Background(), test.input, test.payloadType, test.options...)
			test.validationFunc(t, data, err)
		})
	}
}
