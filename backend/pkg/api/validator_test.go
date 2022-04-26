package api

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsValidKafkaTopicname(t *testing.T) {
	tests := map[string]struct {
		input string
		want  bool
	}{
		// Valids
		"alphanumeric":                            {input: "abc123", want: true},
		"alphanumeric-with-upper-case":            {input: "ABC123", want: true},
		"alphanumeric-with-mixed-case":            {input: "abcABC123", want: true},
		"alphanumeric-with-dash":                  {input: "abc-ABC-123", want: true},
		"alphanumeric-with-dot":                   {input: "abc.ABC.123", want: true},
		"alphanumeric-with-underscore":            {input: "abc_ABC_123", want: true},
		"alphanumeric-with-allowed-special-chars": {input: "abc.ABC-abc_should_work.123", want: true},

		// Invalids
		"alphanumeric-with-colon":         {input: "abc:ABC", want: false},
		"alphanumeric-with-umlaut":        {input: "abcÄBC", want: false},
		"alphanumeric-with-special-chars": {input: "abc@ABC", want: false},
	}

	for name, tc := range tests {
		got := isValidKafkaTopicName(tc.input)
		assert.Equal(t, tc.want, got, fmt.Sprintf("Name: %v, Input: '%v'", name, tc.input))
	}
}
