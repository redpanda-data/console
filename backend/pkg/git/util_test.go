package git

import (
	"github.com/bmizerany/assert"
	"testing"
)

func TestIsValidFileExtension(t *testing.T) {
	markdownSvc := Service{
		Cfg: Config{
			AllowedFileExtensions: []string{"md"},
		},
	}

	tests := []struct {
		input               string
		wantIsValid         bool
		wantTrimmedFilename string
	}{
		{input: "test.md", wantIsValid: true, wantTrimmedFilename: "test"},
		{input: ".md", wantIsValid: true, wantTrimmedFilename: ""},
		{input: "test.MD", wantIsValid: false, wantTrimmedFilename: "test"},
		{input: "test.bin", wantIsValid: false, wantTrimmedFilename: "test"},
		{input: "weird-file.", wantIsValid: false, wantTrimmedFilename: "weird-file"},
	}

	for _, tc := range tests {
		isValid, trimmedFilename := markdownSvc.isValidFileExtension(tc.input)
		assert.Equal(t, tc.wantIsValid, isValid)
		assert.Equal(t, tc.wantTrimmedFilename, trimmedFilename)
	}
}
