package filesystem

type File struct {
	Path     string
	Filename string

	// TrimmedFilename is the filename without the recognized file extension
	TrimmedFilename string

	Payload []byte
}
