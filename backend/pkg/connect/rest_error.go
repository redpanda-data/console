package connect

import (
	"fmt"
	"github.com/go-resty/resty/v2"
)

// ApiError is the standard error message format for all returned errors (status codes in the 400 or 500 range).
type ApiError struct {
	ErrorCode int    `json:"error_code"`
	Message   string `json:"message"`
}

func (a ApiError) Error() string {
	return fmt.Sprintf("%v (%v)", a.Message, a.ErrorCode)
}

// getErrorFromResponse checks if the resty response was successful. If it wasn't it will try to parse the error object
// from the JSON response so that we can return a more descriptive error message.
func getErrorFromResponse(response *resty.Response) error {
	if response == nil {
		return fmt.Errorf("resty response is nil, cannot check for api errors")
	}

	if !response.IsError() {
		return nil
	}

	resErr := response.Error()
	err, ok := resErr.(*ApiError)
	if ok {
		return err
	}
	return fmt.Errorf("unknown error in response. Response size: %db, status: '%v'", response.Size(), response.Status())
}
