package git

import (
	"fmt"
	"github.com/go-git/go-billy/v5"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/transport"
	"github.com/go-git/go-git/v5/plumbing/transport/http"
	"github.com/go-git/go-git/v5/plumbing/transport/ssh"
	"go.uber.org/zap"
	"sync"
)

// Service provides functionality to serve files from a git repository. The contents are stored in memory.
type Service struct {
	Cfg    Config
	auth   transport.AuthMethod
	logger *zap.Logger

	// Proto files in memory git
	protoFs   billy.Filesystem
	protoRepo *git.Repository
	// In memory cache for proto files. Map key is the filename with stripped ".proto" suffix.
	protosByName map[string][]byte
	protosLock   sync.RWMutex

	// TopicDocumentation in memory git
	docuFs   billy.Filesystem
	docuRepo *git.Repository
	// In memory cache for markdowns. Map key is the filename with stripped ".md" suffix.
	markdownsByName map[string][]byte
	markdownsLock   sync.RWMutex
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
