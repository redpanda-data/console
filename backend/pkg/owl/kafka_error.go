package owl

import (
	"errors"
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

func newKafkaError(err error) *KafkaError {
	if err == nil {
		return nil
	}

	var kErr *kerr.Error
	if errors.As(err, &kErr) {
		return &KafkaError{
			Code:        kErr.Code,
			Message:     kErr.Message,
			Description: kErr.Description,
		}
	}

	return &KafkaError{
		Code:        -99,
		Message:     err.Error(),
		Description: "No known error that could be parsed as Kafka Error",
	}
}
