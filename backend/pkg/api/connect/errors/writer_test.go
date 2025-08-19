package errors

import (
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockConnectRPCErrorWriter is a testify Mock for the ConnectRPCErrorWriter interface.
type MockConnectRPCErrorWriter struct {
	mock.Mock
}

func (m *MockConnectRPCErrorWriter) IsSupported(r *http.Request) bool {
	args := m.Called(r)
	return args.Bool(0)
}

func (m *MockConnectRPCErrorWriter) Write(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) error {
	args := m.Called(w, r, err)
	return args.Error(0)
}

func TestConsoleErrorWriter(t *testing.T) {
	// Table of test cases
	testCases := []struct {
		name               string
		requestURL         string
		isSupported        bool // Whether mock says it's ConnectRPC/GRPC
		expectedStatus     int
		expectConnectCall  bool
		expectProgrammatic bool
		expectLegacy       bool
	}{
		{
			name:               "ConnectRPC/GRPC path",
			requestURL:         "/some/grpc/endpoint",
			isSupported:        true,
			expectedStatus:     http.StatusOK, // We'll assume the mock Write won't set a status
			expectConnectCall:  true,
			expectProgrammatic: false,
			expectLegacy:       false,
		},
		{
			name:               "Programmatic API path",
			requestURL:         "/v1/users",
			isSupported:        false,
			expectedStatus:     http.StatusUnauthorized,
			expectConnectCall:  false,
			expectProgrammatic: true,
			expectLegacy:       false,
		},
		{
			name:               "Legacy REST path",
			requestURL:         "/api/topics",
			isSupported:        false,
			expectedStatus:     http.StatusUnauthorized,
			expectConnectCall:  false,
			expectProgrammatic: false,
			expectLegacy:       true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Create a mock writer and a logger
			mockConnectWriter := new(MockConnectRPCErrorWriter)
			logger := slog.New(slog.NewTextHandler(nil, &slog.HandlerOptions{Level: slog.LevelError + 1}))

			// Create an instance of ConsoleErrorWriter
			consoleErrorWriter := NewConsoleErrorWriter(logger)
			consoleErrorWriter.connectRPCErrorWriter = mockConnectWriter

			// Construct a request & recorder
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodGet, tc.requestURL, http.NoBody)

			// Create a sample connect error
			connectErr := connect.NewError(connect.CodeUnauthenticated, errors.New("unauthenticated"))

			// Mock expectations
			mockConnectWriter.On("IsSupported", r).Return(tc.isSupported)

			if tc.expectConnectCall {
				// If we expect Connect, then the .Write method should be called
				mockConnectWriter.
					On("Write", w, r, connectErr).
					Return(nil)
			}

			// Call the method under test
			consoleErrorWriter.WriteError(w, r, connectErr)

			// Validate the mock
			mockConnectWriter.AssertExpectations(t)

			// Check the response
			resp := w.Result()
			assert.Equal(t, tc.expectedStatus, resp.StatusCode)
		})
	}
}
