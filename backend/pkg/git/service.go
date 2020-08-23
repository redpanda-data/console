package git

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/go-git/go-billy/v5"
	"github.com/go-git/go-billy/v5/memfs"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/transport"
	"github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/go-git/go-git/v5/plumbing/transport/ssh"
	"github.com/go-git/go-git/v5/storage/memory"
	"go.uber.org/zap"
)

// Service provides functionality to serve files from a git repository. The contents are stored in memory.
type Service struct {
	Cfg    Config
	auth   transport.AuthMethod
	logger *zap.Logger

	// TopicDocumentation in memory git
	docuFs   billy.Filesystem
	docuRepo *git.Repository

	// In memory cache for markdowns. Map key is the filename with stripped ".md" suffix.
	markdownsByName map[string][]byte
	lock            sync.RWMutex
}

// NewService creates a new Git service with preconfigured Auth
func NewService(cfg Config, logger *zap.Logger) (*Service, error) {
	var auth transport.AuthMethod
	var err error
	switch {
	case cfg.SSH.Enabled:
		logger.Debug("using SSH for Git authentication")
		auth, err = buildSshAuth(cfg.SSH)
	case cfg.BasicAuth.Enabled:
		logger.Debug("using BasicAuth for Git authentication")
		auth = buildBasicAuth(cfg.BasicAuth)
	default:
		logger.Debug("using Git without authentication")
	}

	if err != nil {
		return nil, fmt.Errorf("failed to build git client: %w", err)
	}

	return &Service{
		Cfg:    cfg,
		auth:   auth,
		logger: logger,

		markdownsByName: make(map[string][]byte),
	}, nil
}

// CloneDocumentation clones the git repository which contains the topic documentation
func (c *Service) CloneDocumentation(ctx context.Context) error {
	fs := memfs.New()
	c.docuFs = fs

	// 1. Clone repository
	c.logger.Info("cloning git repository for topic documentation", zap.String("url", c.Cfg.TopicDocumentationRepo.URL))
	repo, err := git.CloneContext(ctx, memory.NewStorage(), fs, &git.CloneOptions{
		URL:  c.Cfg.TopicDocumentationRepo.URL,
		Auth: c.auth,
	})
	if err != nil {
		return err
	}
	c.docuRepo = repo

	// 2. Put markdowns into cache
	empty := make(map[string][]byte)
	markdowns, err := c.readMarkdowns(fs, empty, ".", 5)
	if err != nil {
		return fmt.Errorf("failed to get markdowns: %w", err)
	}
	c.setDocumentations(markdowns)

	c.logger.Info("successfully cloned git repository for topic documentation",
		zap.Int("read_markdown_files", len(markdowns)))

	return nil
}

// SyncDocumentation periodically pulls the repository contents to ensure it's always up to date. When changes appear
// the documentation cache will be updated. This function will periodically pull the repository until the passed context
// is done.
func (c *Service) SyncDocumentation() {
	if c.Cfg.TopicDocumentationRepo.RefreshInterval == 0 {
		c.logger.Info("refresh interval for topic documentation sync is set to 0 (disabled)")
		return
	}

	tree, err := c.docuRepo.Worktree()
	if err != nil {
		c.logger.Error("failed to get work tree from documentation repository. stopping git sync", zap.Error(err))
		return
	}

	// Stop sync when we receive a signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(c.Cfg.TopicDocumentationRepo.RefreshInterval)
	for {
		select {
		case <-quit:
			c.logger.Info("stopped topic documentation sync", zap.String("reason", "received signal"))
			return
		case <-ticker.C:
			err := tree.Pull(&git.PullOptions{Auth: c.auth})
			if err != nil {
				if err == git.NoErrAlreadyUpToDate {
					continue
				}
				c.logger.Error("pulling the topic documentation repo has failed", zap.Error(err))
				continue
			}

			// Update cache with new markdowns
			empty := make(map[string][]byte)
			markdowns, err := c.readMarkdowns(c.docuFs, empty, ".", 5)
			if err != nil {
				c.logger.Error("failed to get documentation markdowns after pulling", zap.Error(err))
				continue
			}
			c.setDocumentations(markdowns)
			c.logger.Info("successfully pulled git repository for topic documentation",
				zap.Int("read_markdown_files", len(markdowns)))
		}
	}
}

func (c *Service) setDocumentations(markdowns map[string][]byte) {
	c.lock.Lock()
	defer c.lock.Unlock()

	c.markdownsByName = markdowns
}

// GetTopicDocumentation returns the cached markdown content for a given topicName.
// The topicName parameter must match the filename in the git repository (case sensitive).
// If there's no match, an empty string (empty byte array) will be returned.
func (c *Service) GetTopicDocumentation(topicName string) []byte {
	c.lock.RLock()
	defer c.lock.RUnlock()

	contents, exists := c.markdownsByName[topicName]
	if !exists {
		return []byte("")
	}

	return contents
}

// readMarkdowns recursively reads the file systems' files until it has read all files or max depth is reached.
func (c *Service) readMarkdowns(fs billy.Filesystem, res map[string][]byte, currentPath string, maxDepth int) (map[string][]byte, error) {
	fileInfos, err := fs.ReadDir(currentPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read dir: %w", err)
	}

	for _, info := range fileInfos {
		name := info.Name()
		if info.IsDir() {
			childPath := path.Join(currentPath, name)
			return c.readMarkdowns(fs, res, childPath, maxDepth-1)
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

func buildBasicAuth(cfg BasicAuthConfig) transport.AuthMethod {
	return &http.BasicAuth{
		Username: cfg.Username,
		Password: cfg.Password,
	}
}

func buildSshAuth(cfg SSHConfig) (transport.AuthMethod, error) {
	if cfg.PrivateKeyFilePath != "" {
		auth, err := ssh.NewPublicKeysFromFile(cfg.Username, cfg.PrivateKeyFilePath, cfg.Passphrase)
		if err != nil {
			return nil, err
		}
		return auth, nil
	}

	if cfg.PrivateKey != "" {
		auth, err := ssh.NewPublicKeys(cfg.Username, []byte(cfg.PrivateKey), cfg.Passphrase)
		if err != nil {
			return nil, err
		}
		return auth, nil
	}

	return nil, fmt.Errorf("no ssh private key configured")
}
