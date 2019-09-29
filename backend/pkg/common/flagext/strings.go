package flagext

import (
	"fmt"
	"strings"
)

// StringsSlice is a custom flag which implemented the flag.Value interface
type StringsSlice []string

func (s *StringsSlice) String() string {
	fmt.Println(&s)
	return fmt.Sprint(&s)
}

// Set parses the flag's value
func (s *StringsSlice) Set(val string) error {
	*s = strings.Split(val, ",")
	return nil
}
