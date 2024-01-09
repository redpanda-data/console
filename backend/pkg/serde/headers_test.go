package serde

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/twmb/franz-go/pkg/kgo"
)

func TestJsonSchemaSerde_recordHeaders(t *testing.T) {
	tests := []struct {
		name     string
		record   *kgo.Record
		expected []RecordHeader
	}{
		{
			name:     "no headers",
			record:   &kgo.Record{},
			expected: []RecordHeader{},
		},
		{
			name: "string values",
			record: &kgo.Record{
				Headers: []kgo.RecordHeader{
					{
						Key:   "k0",
						Value: []byte("v0"),
					},
				},
			},
			expected: []RecordHeader{
				{
					Key:             "k0",
					Value:           []byte("v0"),
					IsValueTooLarge: false,
					Encoding:        HeaderEncodingUTF8,
				},
			},
		},
		{
			name: "byte values",
			record: &kgo.Record{
				Headers: []kgo.RecordHeader{
					{
						Key:   "k0",
						Value: []byte{0xff, 0xfe, 0xfd},
					},
				},
			},
			expected: []RecordHeader{
				{
					Key:             "k0",
					Value:           []byte{0xff, 0xfe, 0xfd},
					IsValueTooLarge: false,
					Encoding:        HeaderEncodingBinary,
				},
			},
		},
		{
			name: "ordered",
			record: &kgo.Record{
				Headers: []kgo.RecordHeader{
					{
						Key:   "k1",
						Value: []byte("v1"),
					},
					{
						Key:   "k2",
						Value: []byte("v2"),
					},
					{
						Key:   "k0",
						Value: []byte("v0"),
					},
					{
						Key:   "k3",
						Value: []byte("v3"),
					},
				},
			},
			expected: []RecordHeader{
				{
					Key:             "k0",
					Value:           []byte("v0"),
					IsValueTooLarge: false,
					Encoding:        HeaderEncodingUTF8,
				},
				{
					Key:             "k1",
					Value:           []byte("v1"),
					IsValueTooLarge: false,
					Encoding:        HeaderEncodingUTF8,
				},
				{
					Key:             "k2",
					Value:           []byte("v2"),
					IsValueTooLarge: false,
					Encoding:        HeaderEncodingUTF8,
				},
				{
					Key:             "k3",
					Value:           []byte("v3"),
					IsValueTooLarge: false,
					Encoding:        HeaderEncodingUTF8,
				},
			},
		},
		{
			name: "same keys",
			record: &kgo.Record{
				Headers: []kgo.RecordHeader{
					{
						Key:   "k0",
						Value: []byte("v0"),
					},
					{
						Key:   "k2",
						Value: []byte("v2"),
					},
					{
						Key:   "k0",
						Value: []byte("v1"),
					},
					{
						Key:   "k3",
						Value: []byte("v3"),
					},
				},
			},
			expected: []RecordHeader{
				{
					Key:             "k0",
					Value:           []byte("v0"),
					IsValueTooLarge: false,
					Encoding:        HeaderEncodingUTF8,
				},
				{
					Key:             "k0",
					Value:           []byte("v1"),
					IsValueTooLarge: false,
					Encoding:        HeaderEncodingUTF8, // TODO this could be non-deterministic?
				},
				{
					Key:             "k2",
					Value:           []byte("v2"),
					IsValueTooLarge: false,
					Encoding:        HeaderEncodingUTF8,
				},
				{
					Key:             "k3",
					Value:           []byte("v3"),
					IsValueTooLarge: false,
					Encoding:        HeaderEncodingUTF8,
				},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			headers := recordHeaders(test.record)
			assert.Equal(t, test.expected, headers)
		})
	}
}
