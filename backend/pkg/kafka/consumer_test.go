package kafka

import (
	"fmt"
	"testing"

	"github.com/dop251/goja"
)

func TestSetupInterpreter(t *testing.T) {
	value := "我爱你中国"
	substr := "中国"
	interpreterCode := fmt.Sprintf(`return value.includes('%s')`, substr)
	vm := goja.New()
	code := fmt.Sprintf(`var isMessageOk = function() {%s}`, interpreterCode)
	vm.RunString(code)
	vm.Set("value", value)
	// Make find() function available inside of the JavaScript VM
	isOkRes, _ := vm.RunString("isMessageOk()")
	if !isOkRes.ToBoolean() {
		t.Errorf("%s.includes(%s)=%s", value, substr, isOkRes.ToString())
	}
	fmt.Println()
}
