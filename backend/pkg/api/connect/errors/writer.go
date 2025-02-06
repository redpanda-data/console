package errors

import (
	"net/http"
	"slices"
	"strings"

	"connectrpc.com/connect"
	"github.com/cloudhut/common/rest"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
)

// ConnectRPCErrorWriter is an interface (or struct) that encapsulates the logic
// to check if a request is supported by ConnectRPC/GRPC, and to write out the
// error in Connect/GRPC format.
type ConnectRPCErrorWriter interface {
	IsSupported(r *http.Request) bool
	Write(response http.ResponseWriter, request *http.Request, err error) error
}

// ConsoleErrorWriter is responsible for writing errors in a protocol-aware
// manner. It checks if the request is ConnectRPC/GRPC, Programmatic API, or
// Legacy REST, and sends an appropriate response.
//
// This error writer can be used in middlewares where the target protocol is
// not clear.
type ConsoleErrorWriter struct {
	connectRPCErrorWriter ConnectRPCErrorWriter
	logger                *zap.Logger
}

// NewConsoleErrorWriter returns a new instance of ConsoleErrorWriter.
func NewConsoleErrorWriter(logger *zap.Logger) *ConsoleErrorWriter {
	return &ConsoleErrorWriter{
		connectRPCErrorWriter: connect.NewErrorWriter(
			// If this option is not set, the errorwriter will always write connect errors
			// as JSON, however for the legacy REST API, we want to write errors in a
			// different JSON schema.
			connect.WithRequireConnectProtocolHeader(),
		),
		logger: logger,
	}
}

// WriteError dispatches the error to the correct writer based on request path
// or other heuristics, such as checking gRPC/Connect headers or URL patterns.
func (c *ConsoleErrorWriter) WriteError(
	w http.ResponseWriter,
	r *http.Request,
	connectErr *connect.Error,
	loggingFields ...zap.Field,
) {
	fields := []zap.Field{
		zap.String("route", r.URL.Path),
		zap.String("method", r.Method),
		zap.Int64("request_size_bytes", r.ContentLength),
		zap.String("remote_address", r.RemoteAddr),
	}
	logger := c.logger.With(slices.Concat(fields, loggingFields)...)

	isConnectRPCOrGrpc := c.connectRPCErrorWriter.IsSupported(r)
	isProgrammaticAPI := strings.HasPrefix(r.URL.Path, "/v1")

	switch {
	case isConnectRPCOrGrpc:
		// Log error and delegate to Connect/GRPC error writer.
		logger.Error("ConnectRPC/GRPC error encountered",

			zap.Error(connectErr),
		)
		if err := c.connectRPCErrorWriter.Write(w, r, connectErr); err != nil {
			// Optionally log if the writer itself fails.
			logger.Error("Failed to write ConnectRPC/GRPC error", zap.Error(err))
		}

	case isProgrammaticAPI:
		// Log error and delegate to your programmatic HTTP error handler.
		c.logger.Error("Programmatic API error encountered", zap.Error(connectErr))
		HandleHTTPError(r.Context(), w, r, connectErr)

	default:
		code := codes.Code(connect.CodeOf(connectErr))
		// Skip logging here; let rest.SendRESTError handle this error quietly.
		rest.SendRESTError(w, r, logger, &rest.Error{
			Err:      connectErr.Unwrap(),
			Status:   runtime.HTTPStatusFromCode(code),
			Message:  connectErr.Message(),
			IsSilent: false,
		})
	}
}
