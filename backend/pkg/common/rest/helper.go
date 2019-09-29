package rest

import (
	"encoding/json"
	"fmt"
	"net/http"

	"go.uber.org/zap"
)

// Helper provides helper methods to send REST compliant responses via HTTP
type Helper struct {
	Logger *zap.Logger
}

// SendResponse tries to send your data as JSON. If this fails it will print REST compliant errors
func (h *Helper) SendResponse(w http.ResponseWriter, r *http.Request, status int, data interface{}) {
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		h.serverError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(jsonBytes)
}

// SendRESTError accepts a REST error which can be send to the user
func (h *Helper) SendRESTError(w http.ResponseWriter, r *http.Request, restErr *Error) {
	if !restErr.IsSilent {
		h.Logger.With(restErr.InternalLogs...).Error(
			"Sending REST error",
			zap.String("route", r.RequestURI),
			zap.String("method", r.Method),
			zap.Error(restErr.Err),
		)
	}

	h.SendResponse(w, r, restErr.Status, restErr)
}

// ServerError prints a plain JSON error message
func (h *Helper) serverError(w http.ResponseWriter, r *http.Request, err error) {
	// Log the detailed error
	h.Logger.Error(
		"internal server error",
		zap.String("route", r.RequestURI),
		zap.String("method", r.Method),
		zap.Int("status_code", http.StatusInternalServerError),
		zap.Error(err),
	)

	// Send a generic response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusInternalServerError)
	jsonErrorString := fmt.Sprintf(
		`{"error"{"statusCode":%d,"message":"Internal Server Error","type":"%v"}}`,
		http.StatusInternalServerError,
		TypeInternalServerError,
	)
	w.Write([]byte(jsonErrorString))
}

// HandleNotFound returns a handler func to respond to non existent routes with a REST compliant
// error message
func (h *Helper) HandleNotFound() http.HandlerFunc {
	restErr := &Error{
		Err:      fmt.Errorf("the requested resource does not exist"),
		Status:   http.StatusNotFound,
		Message:  "Resource was not found.",
		Type:     TypeResourceNotFound,
		IsSilent: true,
	}

	return func(w http.ResponseWriter, r *http.Request) {
		h.SendRESTError(w, r, restErr)
	}
}

// HandleMethodNotAllowed returns a handler func to respond to routes requested with the wrong verb a
// REST compliant error message
func (h *Helper) HandleMethodNotAllowed() http.HandlerFunc {
	restErr := &Error{
		Err:      fmt.Errorf("the method used in the request is not allowed"),
		Status:   http.StatusMethodNotAllowed,
		Message:  "Method is not allowed.",
		Type:     TypeMethodNotAllowed,
		IsSilent: true,
	}

	return func(w http.ResponseWriter, r *http.Request) {
		h.SendRESTError(w, r, restErr)
	}
}
