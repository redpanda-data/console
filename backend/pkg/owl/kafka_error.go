package owl

import (
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
)

type KafkaError struct {
	Code        int16  `json:"code"`
	Message     string `json:"message"`
	Description string `json:"description"`
}

func (e *KafkaError) Error() string {
	return fmt.Sprintf("%s: %s", e.Message, e.Description)
}

func newKafkaError(errCode int16) *KafkaError {
	typedError := kerr.TypedErrorForCode(errCode)
	if typedError == nil {
		return nil
	}

	return &KafkaError{
		Code:        typedError.Code,
		Message:     typedError.Message,
		Description: typedError.Description,
	}
}
