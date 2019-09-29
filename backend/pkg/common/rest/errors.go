package rest

import "go.uber.org/zap/zapcore"

// Error must be created to issue a REST compliant error
type Error struct {
	Err          error           `json:"-"`
	Status       int             `json:"statusCode"`
	Message      string          `json:"message"`
	Type         Type            `json:"type"`
	InternalLogs []zapcore.Field `json:"-"`
	IsSilent     bool            `json:"-"`
}

// Type represents a unique error code for the error JSON response,
// which can be used to handle errors
type Type string

// Error Types
const (
	TypeResourceNotFound    Type = "ResourceNotFound"
	TypeMethodNotAllowed    Type = "MethodNotAllowed"
	TypeInvalidCredentials  Type = "InvalidCredentials"
	TypeBadRequest          Type = "BadRequest"
	TypeInternalServerError Type = "InternalServerError"
)
