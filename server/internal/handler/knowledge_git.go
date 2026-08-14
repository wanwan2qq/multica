package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

var knowledgeHTTPClient = &http.Client{Timeout: 20 * time.Second}

var errKnowledgeFileNotFound = errors.New("knowledge file not found")

type gitRemote struct {
	Host     string
	Owner    string
	Repo     string
	Provider string
}

func (r gitRemote) projectPath() string {
	if r.Owner == "" {
		return r.Repo
	}
	return r.Owner + "/" + r.Repo
}

func parseGitRemote(raw string) (gitRemote, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return gitRemote{}, fmt.Errorf("repository URL is empty")
	}
	var host, repoPath string
	if strings.HasPrefix(raw, "git@") {
		rest := strings.TrimPrefix(raw, "git@")
		var ok bool
		host, repoPath, ok = strings.Cut(rest, ":")
		if !ok {
			return gitRemote{}, fmt.Errorf("invalid git SSH URL")
		}
	} else {
		if !strings.Contains(raw, "://") {
			raw = "https://" + raw
		}
		parsed, err := url.Parse(raw)
		if err != nil {
			return gitRemote{}, fmt.Errorf("invalid repository URL: %w", err)
		}
		host = parsed.Hostname()
		repoPath = strings.Trim(parsed.Path, "/")
	}
	parts := make([]string, 0, 4)
	for _, part := range strings.Split(repoPath, "/") {
		if part == "" || part == ".git" {
			continue
		}
		parts = append(parts, part)
	}
	if len(parts) < 2 {
		return gitRemote{}, fmt.Errorf("expected owner/repo in %s", raw)
	}
	repo := strings.TrimSuffix(parts[len(parts)-1], ".git")
	owner := strings.Join(parts[:len(parts)-1], "/")
	provider := "gitea"
	if host == "github.com" || host == "www.github.com" {
		if len(parts) != 2 {
			return gitRemote{}, fmt.Errorf("expected owner/repo in %s", raw)
		}
		provider = "github"
		host = "github.com"
	} else if len(parts) >= 3 || strings.EqualFold(strings.TrimSpace(os.Getenv("KNOWLEDGE_GIT_PROVIDER")), "gitlab") {
		provider = "gitlab"
	}
	return gitRemote{
		Host:     host,
		Owner:    owner,
		Repo:     repo,
		Provider: provider,
	}, nil
}

func escapeRepoPath(p string) string {
	parts := strings.Split(strings.TrimPrefix(p, "/"), "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func (r gitRemote) browseFile(ref, filePath string) string {
	ref = strings.TrimPrefix(ref, "/")
	filePath = strings.TrimPrefix(filePath, "/")
	if r.Provider == "github" {
		if filePath == "" {
			return fmt.Sprintf("https://github.com/%s/%s/tree/%s", r.Owner, r.Repo, ref)
		}
		return fmt.Sprintf("https://github.com/%s/%s/blob/%s/%s", r.Owner, r.Repo, ref, filePath)
	}
	base := fmt.Sprintf("https://%s/%s", r.Host, r.projectPath())
	if r.Provider == "gitlab" {
		if filePath == "" {
			return fmt.Sprintf("%s/-/tree/%s", base, ref)
		}
		return fmt.Sprintf("%s/-/blob/%s/%s", base, ref, filePath)
	}
	if filePath == "" {
		return fmt.Sprintf("%s/src/branch/%s", base, ref)
	}
	return fmt.Sprintf("%s/src/branch/%s/%s", base, ref, filePath)
}

func resolveDefaultRefHTTP(ctx context.Context, remote gitRemote) (string, error) {
	var apiURL string
	switch remote.Provider {
	case "github":
		apiURL = fmt.Sprintf("https://api.github.com/repos/%s/%s", url.PathEscape(remote.Owner), url.PathEscape(remote.Repo))
	case "gitlab":
		apiURL = fmt.Sprintf("https://%s/api/v4/projects/%s", remote.Host, url.PathEscape(remote.projectPath()))
	default:
		apiURL = fmt.Sprintf("https://%s/api/v1/repos/%s/%s", remote.Host, url.PathEscape(remote.Owner), url.PathEscape(remote.Repo))
	}
	resp, err := knowledgeGET(ctx, apiURL, remote.Provider, "")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to read repository metadata (HTTP %d)", resp.StatusCode)
	}
	var payload struct {
		DefaultBranch string `json:"default_branch"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("decode repository metadata: %w", err)
	}
	if strings.TrimSpace(payload.DefaultBranch) == "" {
		return "main", nil
	}
	return payload.DefaultBranch, nil
}

func fetchKnowledgeTreeHTTP(ctx context.Context, remote gitRemote) (string, []knowledgeTreeEntry, error) {
	ref, err := resolveDefaultRefHTTP(ctx, remote)
	if err != nil {
		return "", nil, err
	}
	if remote.Provider == "gitlab" {
		entries, err := fetchGitLabTreeHTTP(ctx, remote, ref)
		return ref, entries, err
	}
	var apiURL string
	if remote.Provider == "github" {
		apiURL = fmt.Sprintf("https://api.github.com/repos/%s/%s/git/trees/%s?recursive=1",
			url.PathEscape(remote.Owner), url.PathEscape(remote.Repo), url.PathEscape(ref))
	} else {
		apiURL = fmt.Sprintf("https://%s/api/v1/repos/%s/%s/git/trees/%s?recursive=true",
			remote.Host, url.PathEscape(remote.Owner), url.PathEscape(remote.Repo), url.PathEscape(ref))
	}
	resp, err := knowledgeGET(ctx, apiURL, remote.Provider, "")
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("failed to list repository tree (HTTP %d)", resp.StatusCode)
	}
	var payload struct {
		Tree []knowledgeTreeItem `json:"tree"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", nil, fmt.Errorf("decode repository tree: %w", err)
	}
	return ref, filterKnowledgeTree(payload.Tree), nil
}

type knowledgeTreeItem struct {
	Path string `json:"path"`
	Type string `json:"type"`
	Size int64  `json:"size"`
}

func filterKnowledgeTree(items []knowledgeTreeItem) []knowledgeTreeEntry {
	entries := make([]knowledgeTreeEntry, 0, len(items))
	for _, item := range items {
		if item.Path == "" {
			continue
		}
		if strings.HasPrefix(item.Path, ".git/") || strings.Contains(item.Path, "/node_modules/") || strings.HasPrefix(item.Path, "node_modules/") {
			continue
		}
		kind := item.Type
		if kind != "blob" && kind != "tree" {
			continue
		}
		entries = append(entries, knowledgeTreeEntry{Path: item.Path, Type: kind, Size: item.Size})
	}
	return entries
}

func fetchGitLabTreeHTTP(ctx context.Context, remote gitRemote, ref string) ([]knowledgeTreeEntry, error) {
	projectID := url.PathEscape(remote.projectPath())
	var items []knowledgeTreeItem
	page := "1"
	for page != "" {
		apiURL := fmt.Sprintf("https://%s/api/v4/projects/%s/repository/tree?ref=%s&recursive=true&per_page=100&page=%s",
			remote.Host, projectID, url.QueryEscape(ref), url.QueryEscape(page))
		resp, err := knowledgeGET(ctx, apiURL, remote.Provider, "")
		if err != nil {
			return nil, err
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to list repository tree (HTTP %d)", resp.StatusCode)
		}
		var pageItems []knowledgeTreeItem
		if err := json.NewDecoder(resp.Body).Decode(&pageItems); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("decode repository tree: %w", err)
		}
		resp.Body.Close()
		items = append(items, pageItems...)
		page = strings.TrimSpace(resp.Header.Get("X-Next-Page"))
	}
	return filterKnowledgeTree(items), nil
}

func fetchKnowledgeFileHTTP(ctx context.Context, remote gitRemote, ref, filePath string) ([]byte, bool, error) {
	var apiURL string
	encodedPath := escapeRepoPath(filePath)
	accept := ""
	switch remote.Provider {
	case "github":
		apiURL = fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s?ref=%s",
			url.PathEscape(remote.Owner), url.PathEscape(remote.Repo), encodedPath, url.QueryEscape(ref))
		accept = "application/vnd.github.raw"
	case "gitlab":
		apiURL = fmt.Sprintf("https://%s/api/v4/projects/%s/repository/files/%s/raw?ref=%s",
			remote.Host, url.PathEscape(remote.projectPath()), url.PathEscape(filePath), url.QueryEscape(ref))
	default:
		apiURL = fmt.Sprintf("https://%s/api/v1/repos/%s/%s/raw/%s?ref=%s",
			remote.Host, url.PathEscape(remote.Owner), url.PathEscape(remote.Repo), encodedPath, url.QueryEscape(ref))
	}
	resp, err := knowledgeGET(ctx, apiURL, remote.Provider, accept)
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, false, errKnowledgeFileNotFound
	}
	if resp.StatusCode != http.StatusOK {
		return nil, false, fmt.Errorf("failed to read %s (HTTP %d)", filePath, resp.StatusCode)
	}
	limited := io.LimitReader(resp.Body, knowledgeMaxFileBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return nil, false, err
	}
	truncated := len(body) > knowledgeMaxFileBytes
	if truncated {
		body = body[:knowledgeMaxFileBytes]
	}
	return body, truncated, nil
}

func knowledgeGET(ctx context.Context, apiURL, provider, accept string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "multica-knowledge")
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	if provider == "github" {
		addGitHubAuthHeader(req)
	} else if token := strings.TrimSpace(os.Getenv("KNOWLEDGE_GIT_TOKEN")); token != "" {
		if provider == "gitlab" {
			req.Header.Set("PRIVATE-TOKEN", token)
		} else {
			req.Header.Set("Authorization", "token "+token)
		}
	}
	return knowledgeHTTPClient.Do(req)
}
