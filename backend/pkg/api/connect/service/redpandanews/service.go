// Package redpandanews implements the RedpandaNewsService interface for retrieving news from Redpanda's RSS feed.
package redpandanews

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	consolev1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

const (
	redpandaNewsRSSURL = "https://www.redpanda.com/console-marketing-resources/rss.xml"
)

// Service implements the RedpandaNewsService interface
type Service struct {
	logger *zap.Logger
}

// NewService creates a new RedpandaNewsService
func NewService(logger *zap.Logger) *Service {
	return &Service{
		logger: logger,
	}
}

// RSSFeed represents the structure of the Redpanda news RSS feed XML.
type RSSFeed struct {
	XMLName xml.Name `xml:"rss"`
	Channel struct {
		Title       string `xml:"title"`
		Link        string `xml:"link"`
		Description string `xml:"description"`
		PubDate     string `xml:"pubDate"`
		TTL         int    `xml:"ttl"`
		Generator   string `xml:"generator"`
		Items       []struct {
			Title       string `xml:"title"`
			Link        string `xml:"link"`
			GUID        string `xml:"guid"`
			Description string `xml:"description"`
			PubDate     string `xml:"pubDate"`
		} `xml:"item"`
	} `xml:"channel"`
}

// parseDate attempts to parse a date string in RFC1123 or RFC1123Z format
func parseDate(dateStr string) (time.Time, error) {
	if t, err := time.Parse(time.RFC1123, dateStr); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC1123Z, dateStr)
}

// GetRedpandaNews implements the GetRedpandaNews RPC method
func (s *Service) GetRedpandaNews(
	ctx context.Context,
	_ *connect.Request[consolev1alpha1.GetRedpandaNewsRequest],
) (*connect.Response[consolev1alpha1.GetRedpandaNewsResponse], error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, redpandaNewsRSSURL, http.NoBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch news: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch news: status code %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read news: %w", err)
	}

	var feed RSSFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, fmt.Errorf("failed to parse news: %w", err)
	}

	// Convert items to response format
	newsItems := make([]*consolev1alpha1.RedpandaNewsItem, 0, len(feed.Channel.Items))
	for _, item := range feed.Channel.Items {
		pubDate, err := parseDate(item.PubDate)
		if err != nil {
			s.logger.Warn("failed to parse pubDate", zap.String("pubDate", item.PubDate), zap.Error(err))
			continue
		}

		newsItems = append(newsItems, &consolev1alpha1.RedpandaNewsItem{
			Title:       item.Title,
			Link:        item.Link,
			Description: item.Description,
			PubDate:     pubDate.Format(time.RFC3339),
		})
	}

	// Parse the channel pubDate
	lastUpdated, err := parseDate(feed.Channel.PubDate)
	if err != nil {
		s.logger.Warn("failed to parse channel pubDate", zap.String("pubDate", feed.Channel.PubDate), zap.Error(err))
		lastUpdated = time.Now()
	}

	response := &consolev1alpha1.GetRedpandaNewsResponse{
		Title:       feed.Channel.Title,
		LastUpdated: lastUpdated.Format(time.RFC3339),
		NewsItems:   newsItems,
	}

	return connect.NewResponse(response), nil
}
