package git

import (
	"context"
	"fmt"
	"github.com/go-git/go-billy/v5"
	"github.com/go-git/go-billy/v5/memfs"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/transport"
	"github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/go-git/go-git/v5/plumbing/transport/ssh"
	"github.com/go-git/go-git/v5/storage/memory"
	"go.uber.org/zap"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

// Service provides functionality to serve files from a git repository. The contents are stored in memory.
type Service struct {
	Cfg    Config
	auth   transport.AuthMethod
	logger *zap.Logger

	// TopicDocumentation in memory git
	memFs billy.Filesystem
	repo  *git.Repository

	// In memory cache for markdowns. Map key is the filename with stripped ".md" suffix.
	filesByName map[string][]byte
	mutex       sync.RWMutex
}

// NewService creates a new Git service with preconfigured Auth
func NewService(cfg Config, logger *zap.Logger) (*Service, error) {
	childLogger := logger.With(zap.String("repository_url", cfg.Repository.URL))

	var auth transport.AuthMethod
	var err error
	switch {
	case cfg.SSH.Enabled:
		childLogger.Debug("using SSH for Git authentication")
		auth, err = buildSshAuth(cfg.SSH)
	case cfg.BasicAuth.Enabled:
		childLogger.Debug("using BasicAuth for Git authentication")
		auth = buildBasicAuth(cfg.BasicAuth)
	default:
		childLogger.Debug("using Git without authentication")
	}

	if err != nil {
		return nil, fmt.Errorf("failed to build git client: %w", err)
	}

	return &Service{
		Cfg:    cfg,
		auth:   auth,
		logger: childLogger,

		filesByName: make(map[string][]byte),
	}, nil
}

// Start all configured git syncs. Initially trigger them once and return an error if there are issues.
func (c *Service) Start() error {
	if !c.Cfg.Enabled {
		return nil
	}

	err := c.CloneRepository(context.Background())
	if err != nil {
		return fmt.Errorf("failed to clone git repo: %w", err)
	}

	// Start background sync task
	go c.SyncRepo()

	return nil
}

// CloneRepository clones the git repository
func (c *Service) CloneRepository(ctx context.Context) error {
	fs := memfs.New()
	c.memFs = fs

	// 1. Clone repository
	var referenceName plumbing.ReferenceName
	if c.Cfg.Repository.Branch != "" {
		referenceName = plumbing.NewBranchReferenceName(c.Cfg.Repository.Branch)
	}
	c.logger.Info("cloning git repository", zap.String("url", c.Cfg.Repository.URL))
	repo, err := git.CloneContext(ctx, memory.NewStorage(), fs, &git.CloneOptions{
		URL:           c.Cfg.Repository.URL,
		Auth:          c.auth,
		ReferenceName: referenceName,
	})
	if err != nil {
		return err
	}
	c.repo = repo

	// 2. Put markdowns into cache
	empty := make(map[string][]byte)
	markdowns, err := c.readFiles(fs, empty, ".", 5)
	if err != nil {
		return fmt.Errorf("failed to get markdowns: %w", err)
	}
	c.setFileContents(markdowns)

	c.logger.Info("successfully cloned git repository",
		zap.Int("read_markdown_files", len(markdowns)))

	return nil
}

// SyncRepo periodically pulls the repository contents to ensure it's always up to date. When changes appear
// the file cache will be updated. This function will periodically pull the repository until the passed context
// is done.
func (c *Service) SyncRepo() {
	if c.Cfg.RefreshInterval == 0 {
		c.logger.Info("refresh interval for sync is set to 0 (disabled)")
		return
	}

	tree, err := c.repo.Worktree()
	if err != nil {
		c.logger.Error("failed to get work tree from repository. stopping git sync", zap.Error(err))
		return
	}

	// Stop sync when we receive a signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(c.Cfg.RefreshInterval)
	for {
		select {
		case <-quit:
			c.logger.Info("stopped sync", zap.String("reason", "received signal"))
			return
		case <-ticker.C:
			err := tree.Pull(&git.PullOptions{Auth: c.auth})
			if err != nil {
				if err == git.NoErrAlreadyUpToDate {
					continue
				}
				c.logger.Error("pulling the repo has failed", zap.Error(err))
				continue
			}

			// Update cache with new markdowns
			empty := make(map[string][]byte)
			files, err := c.readFiles(c.memFs, empty, ".", 5)
			if err != nil {
				c.logger.Error("failed to read files after pulling", zap.Error(err))
				continue
			}
			c.setFileContents(files)
			c.logger.Info("successfully pulled git repository",
				zap.Int("read_files", len(files)))
		}
	}
}

// setFileContents saves file contents into memory, so that they are accessible at any time.
// filesByName is a map where the key is the filename without extension suffix (e.g. "README" instead of "README.md")
func (c *Service) setFileContents(filesByName map[string][]byte) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.filesByName = filesByName
}

// GetFileByFilename returns the cached content for a given filename (without extension).
// The parameter must match the filename in the git repository (case sensitive).
// If there's no match nil will be returned.
func (c *Service) GetFileByFilename(fileName string) []byte {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	contents, exists := c.filesByName[fileName]
	if !exists {
		return nil
	}

	return contents
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
