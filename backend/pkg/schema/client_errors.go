package schema

const (
	codeSubjectNotFound       = 40401
	codeSchemaNotFound        = 40403
	codeBackendDatastoreError = 50001
)

func IsSchemaNotFound(err error) bool {
	if err == nil {
		return false
	}

	if restErr, ok := err.(RestError); ok {
		return restErr.ErrorCode == codeSchemaNotFound
	}

	return false
}
