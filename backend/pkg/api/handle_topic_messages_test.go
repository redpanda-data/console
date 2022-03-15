package api

import (
	"encoding/base64"
	"fmt"
	"strings"
	"testing"
)

func TestDecodeInterpreterCode(t *testing.T) {
	FilterInterpreterCode := "CmZ1bmN0aW9uIGZpbHRlcjEoKSB7CiAgICByZXR1cm4gdmFsdWUuY24uaW5jbHVkZXMoIuemjyIpCn0KCnJldHVybiBmaWx0ZXIxKCk="
	code, _ := base64.StdEncoding.DecodeString(FilterInterpreterCode)
	if !strings.Contains(string(code), "福") {
		t.Errorf("decode base64 error,%s\n%s", FilterInterpreterCode, code)
	}
	fmt.Printf("decode base64 code,%s\n%s", FilterInterpreterCode, code)
	fmt.Println()
}
