package git

import (
	"fmt"
	"github.com/go-git/go-billy/v5"
)

func readFile(fileName string, fs billy.Filesystem, maxSize int64) ([]byte, error) {
	fileInfo, err := fs.Stat(fileName)
	if err != nil {
		return nil, fmt.Errorf("failed to get file info: %w", err)
	}
	fileSize := fileInfo.Size()
	if fileSize > maxSize {
		return nil, fmt.Errorf("file size is larger than the expected maxSize of '%d' bytes", maxSize)
	}

	file, err := fs.Open(fileName)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}

	contents := make([]byte, fileSize)
	_, err = file.Read(contents)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	return contents, nil
}
