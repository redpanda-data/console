package git

import (
	"fmt"
	"github.com/go-git/go-billy/v5"
	"go.uber.org/zap"
	"path"
	"strings"
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

// readFiles recursively reads the file systems' files until it has read all files or max depth is reached.
func (c *Service) readFiles(fs billy.Filesystem, res map[string][]byte, currentPath string, maxDepth int) (map[string][]byte, error) {
	fileInfos, err := fs.ReadDir(currentPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read dir: %w", err)
	}

	for _, info := range fileInfos {
		name := info.Name()
		if info.IsDir() {
			childPath := path.Join(currentPath, name)
			return c.readFiles(fs, res, childPath, maxDepth-1)
		}

		isMarkdownFile := strings.HasSuffix(name, ".md")
		if !isMarkdownFile {
			continue
		}

		content, err := readFile(name, fs, 50*1000)
		if err != nil {
			c.logger.Error("failed to read file from git. file will be skipped",
				zap.String("file_name", name),
				zap.String("path", currentPath), zap.Error(err))
			continue
		}
		trimmedName := strings.TrimSuffix(name, ".md")
		res[trimmedName] = content
	}

	return res, nil
}
