package groups

import (
	"context"
	"io/ioutil"
	"time"

	"go.uber.org/zap"
	"golang.org/x/oauth2/google"

	admin "google.golang.org/api/admin/directory/v1"
	"google.golang.org/api/option"

	"fmt"
)

var (
	scopes = []string{
		"https://www.googleapis.com/auth/admin.directory.user.readonly",
		"https://www.googleapis.com/auth/admin.directory.group.readonly",

		// We're not using roles yet, but when we do, we need the following scope to get roles and roleAssignments
		// "https://www.googleapis.com/auth/admin.directory.rolemanagement.readonly",
	}
)

// Groups bla
type Groups struct {
	log   *zap.SugaredLogger
	admin *admin.Service
}

// NewGroups creates a manager that fetches, caches, and automatically updates information about users and the groups they are part of.
//
// The credentials file:
// - Must contain the "key" json. (You can download that file on the page that lists all service accounts, just click 'Create Key')
// - Must have the 'domain wide delegation' option checked!
// - Must have gotten permission for the needed scopes from the admin account (described below)
//
// The admin must add all the scoped permissions (what the service account can do while impersonating the admin) on this page:
// https://admin.google.com/EXAMPLEDOMAIN.COM/AdminHome?#OGX:ManageOauthClients
//
func NewGroups(logger *zap.Logger, serviceAccountCredentialsFilePath string, adminAccountEmail string) *Groups {
	log := logger.Sugar()
	credsPath := serviceAccountCredentialsFilePath

	admin, err := createDirectoryService(adminAccountEmail, credsPath, scopes...)
	if err != nil {
		log.Panicw("cant create google directory service", "error", err)
	}

	return &Groups{log, admin}
}

func createDirectoryService(userEmail string, serviceAccountFilePath string, scopes ...string) (*admin.Service, error) {
	ctx := context.Background()

	jsonCredentials, err := ioutil.ReadFile(serviceAccountFilePath)
	if err != nil {
		return nil, err
	}

	config, err := google.JWTConfigFromJSON(jsonCredentials, scopes...)
	if err != nil {
		return nil, fmt.Errorf("JWTConfigFromJSON: %v", err)
	}
	config.Subject = userEmail

	ts := config.TokenSource(ctx)

	srv, err := admin.NewService(ctx, option.WithTokenSource(ts))
	if err != nil {
		return nil, fmt.Errorf("NewService: %v", err)
	}
	return srv, nil
}

// UserInfo x
type UserInfo struct {
	Email     string
	Groups    []string
	FetchTime time.Time // when the user (and/or groups) was last updated
}

var (
	userCache = make(map[string]*UserInfo) // email -> UserInfo

	maxInfoAge = 2 * time.Minute
)

// IsUserInGroup x
func (g *Groups) IsUserInGroup(email string, groupName string) (bool, error) {

	user := userCache[email]
	if user == nil || time.Now().Sub(user.FetchTime) > maxInfoAge {
		gUser, err := g.admin.Users.Get(email).Do()
		if err != nil {
			return false, err
		}

		groupNames, err := g.getUserGroups(email)
		if err != nil {
			return false, err
		}

		user = &UserInfo{gUser.PrimaryEmail, groupNames, time.Now()}
		userCache[email] = user
	}

	for i := range user.Groups {
		if user.Groups[i] == groupName {
			return true, nil
		}
	}

	return false, nil
}

func (g *Groups) getUserGroups(email string) ([]string, error) {

	request := g.admin.Groups.List().MaxResults(10000).UserKey(email)

	// Iterate over all pages (if there is more than one), and put all group names in one array
	groupNames := make([]string, 0, 10)
	err := request.Pages(context.Background(), func(page *admin.Groups) error {
		for _, group := range page.Groups {
			groupNames = append(groupNames, group.Name)
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return groupNames, nil
}
