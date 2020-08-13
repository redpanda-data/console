package schema

import (
	"fmt"
	"github.com/linkedin/goavro/v2"
	"golang.org/x/sync/singleflight"
	"sync"
)

// Service for fetching schemas from a schema registry. It has to provide an interface for other packages which is safe
// for concurrent access and also takes care of caching schemas.
type Service struct {
	cfg          Config
	requestGroup singleflight.Group

	registryClient *Client

	// Schema Cache by schema id
	cacheByID map[uint32]*goavro.Codec
	cacheLock sync.RWMutex
}

// NewService to access schema registry. Returns an error if connection can't be established.
func NewSevice(cfg Config) *Service {
	return &Service{
		cfg:            cfg,
		requestGroup:   singleflight.Group{},
		registryClient: newClient(cfg),
		cacheByID:      make(map[uint32]*goavro.Codec),
		cacheLock:      sync.RWMutex{},
	}
}

// CheckConnectivity to schema registry. Returns no error if connectivity is fine.
func (s *Service) CheckConnectivity() error {
	return s.registryClient.CheckConnectivity()
}

func (s *Service) GetAvroSchemaByID(schemaID uint32) (*goavro.Codec, error) {
	// 1. Check if codec is available in cache
	s.cacheLock.RLock()
	cachedCodec, exists := s.cacheByID[schemaID]
	s.cacheLock.RUnlock()
	if exists {
		return cachedCodec, nil
	}

	// 2. Not available so let's request it from schema registry but make sure to suppress duplicate requests
	key := fmt.Sprintf("get-avro-schema-%d", schemaID)
	defer s.requestGroup.Forget(key)
	v, err, _ := s.requestGroup.Do(key, func() (interface{}, error) {
		return s.registryClient.GetSchemaByID(schemaID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to fetch schema from schema registry: %w", err)
	}

	// 3. Compile schema string to avro codec
	schemaRes := v.(*SchemaResponse)
	codec, err := goavro.NewCodec(schemaRes.Schema)
	if err != nil {
		return nil, fmt.Errorf("failed to create codec from schema string: %w", err)
	}

	// 4. Add to cache
	s.cacheLock.Lock()
	s.cacheByID[schemaID] = codec
	s.cacheLock.Unlock()

	return codec, nil
}
