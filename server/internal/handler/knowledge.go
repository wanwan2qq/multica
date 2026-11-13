package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/storage"
	"github.com/multica-ai/multica/server/internal/util"
)

const knowledgeMaxFileBytes = 256 * 1024

// knowledgeMaxDownloadBytes bounds what a download buffers in memory. The
// knowledge repository is user-configured, so an unbounded read would let one
// oversized blob in it decide the API process's memory ceiling.
const knowledgeMaxDownloadBytes = 64 << 20

type knowledgeTreeEntry struct {
	Path string `json:"path"`
	Type string `json:"type"`
	Size int64  `json:"size,omitempty"`
}

type knowledgeTreeResponse struct {
	RepoURL     string               `json:"repo_url"`
	Description string               `json:"description"`
	Ref         string               `json:"ref"`
	BrowseURL   string               `json:"browse_url"`
	Provider    string               `json:"provider"`
	Entries     []knowledgeTreeEntry `json:"entries"`
}

type knowledgeFileResponse struct {
	Path      string `json:"path"`
	Ref       string `json:"ref"`
	BrowseURL string `json:"browse_url"`
	Media     string `json:"media"`
	Truncated bool   `json:"truncated"`
	Size      int    `json:"size"`
	Content   string `json:"content"`
	// AssetsBase is the site-relative prefix sibling files resolve against —
	// the image in a markdown document, the `src` of an <img> in an HTML
	// document. It carries a path-scoped capability token because native
	// subresource loads cannot authenticate (see ServeKnowledgeAsset).
	AssetsBase string `json:"assets_base"`
}

func pickKnowledgeRepo(repos []workspaceRepoRef) (workspaceRepoRef, bool) {
	for _, repo := range repos {
		if isKnowledgeDescription(repo.Description) {
			return repo, true
		}
	}
	if len(repos) == 1 {
		return repos[0], true
	}
	return workspaceRepoRef{}, false
}

// knowledgeSources is the ordered list the browser can open. Explicit
// knowledge flags win as a set. With none set, the legacy single-repo pick
// stays the whole list, so a workspace that already has one tagged repo does
// not change until someone opts more in.
func knowledgeSources(repos []workspaceRepoRef) []workspaceRepoRef {
	explicit := make([]workspaceRepoRef, 0)
	for _, repo := range repos {
		if repo.Knowledge {
			explicit = append(explicit, repo)
		}
	}
	if len(explicit) > 0 {
		return explicit
	}
	if repo, ok := pickKnowledgeRepo(repos); ok {
		return []workspaceRepoRef{repo}
	}
	return nil
}

// selectKnowledgeSource picks one source. An empty request uses the first
// (the default). kind is "", "missing", or "unknown".
func selectKnowledgeSource(sources []workspaceRepoRef, requested string) (workspaceRepoRef, string) {
	requested = strings.TrimSpace(requested)
	if len(sources) == 0 {
		return workspaceRepoRef{}, "missing"
	}
	if requested == "" {
		return sources[0], ""
	}
	for _, repo := range sources {
		if repo.URL == requested {
			return repo, ""
		}
	}
	return workspaceRepoRef{}, "unknown"
}

func isKnowledgeDescription(description string) bool {
	lower := strings.ToLower(description)
	return strings.Contains(description, "知识库") || strings.Contains(lower, "knowledge")
}

func (h *Handler) loadKnowledgeRepo(w http.ResponseWriter, r *http.Request) (pgtype.UUID, workspaceRepoRef, gitRemote, string, bool) {
	workspaceID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "workspace_id")
	if !ok {
		return pgtype.UUID{}, workspaceRepoRef{}, gitRemote{}, "", false
	}
	repo, remote, token, ok := h.loadKnowledgeRepoForWorkspace(r.Context(), w, workspaceID, r.URL.Query().Get("repo"), false)
	return workspaceID, repo, remote, token, ok
}

// loadKnowledgeRepoForWorkspace resolves one knowledge repository of a
// workspace. requested is the repo query (or the asset token's repo); empty
// selects the default source. public routes answer missing and unknown with
// 404 — the capability URL must not describe the workspace's configuration.
func (h *Handler) loadKnowledgeRepoForWorkspace(ctx context.Context, w http.ResponseWriter, workspaceID pgtype.UUID, requested string, public bool) (workspaceRepoRef, gitRemote, string, bool) {
	repos, token, ok := h.readWorkspaceRepos(ctx, w, workspaceID, public)
	if !ok {
		return workspaceRepoRef{}, gitRemote{}, "", false
	}
	repo, kind := selectKnowledgeSource(knowledgeSources(repos), requested)
	if kind != "" {
		if public {
			writeError(w, http.StatusNotFound, "not found")
		} else if kind == "unknown" {
			writeErrorCode(w, http.StatusBadRequest, "knowledge_repo_unknown", "repository is not a knowledge source")
		} else {
			writeErrorCode(w, http.StatusNotFound, "knowledge_repo_not_configured", "no knowledge repository configured; mark a workspace repo as a knowledge source, or add one whose description contains 知识库 or knowledge")
		}
		return workspaceRepoRef{}, gitRemote{}, "", false
	}
	remote, err := parseGitRemote(repo.URL)
	if err != nil {
		if public {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return workspaceRepoRef{}, gitRemote{}, "", false
	}
	return repo, remote, token, true
}

// readWorkspaceRepos loads the workspace repository list. The token is the
// browse credential, never a repository URL.
func (h *Handler) readWorkspaceRepos(ctx context.Context, w http.ResponseWriter, workspaceID pgtype.UUID, public bool) ([]workspaceRepoRef, string, bool) {
	ws, err := h.Queries.GetWorkspace(ctx, workspaceID)
	if err != nil {
		if public {
			writeError(w, http.StatusNotFound, "not found")
		} else {
			writeError(w, http.StatusNotFound, "workspace not found")
		}
		return nil, "", false
	}
	var repos []workspaceRepoRef
	if len(ws.Repos) > 0 {
		if err := json.Unmarshal(ws.Repos, &repos); err != nil {
			if public {
				writeError(w, http.StatusNotFound, "not found")
			} else {
				writeError(w, http.StatusInternalServerError, "failed to read workspace repositories")
			}
			return nil, "", false
		}
	}
	return repos, knowledgeGitTokenFromSettings(ws.Settings), true
}

type knowledgeSourceResponse struct {
	URL         string `json:"url"`
	Description string `json:"description,omitempty"`
}

type knowledgeSourcesResponse struct {
	Sources []knowledgeSourceResponse `json:"sources"`
}

func (h *Handler) GetKnowledgeSources(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "workspace_id")
	if !ok {
		return
	}
	repos, _, ok := h.readWorkspaceRepos(r.Context(), w, workspaceID, false)
	if !ok {
		return
	}
	sources := knowledgeSources(repos)
	out := make([]knowledgeSourceResponse, 0, len(sources))
	for _, source := range sources {
		out = append(out, knowledgeSourceResponse{
			URL:         source.URL,
			Description: source.Description,
		})
	}
	writeJSON(w, http.StatusOK, knowledgeSourcesResponse{Sources: out})
}

func (h *Handler) GetKnowledgeTree(w http.ResponseWriter, r *http.Request) {
	_, repo, remote, token, ok := h.loadKnowledgeRepo(w, r)
	if !ok {
		return
	}
	ctx := withKnowledgeToken(r.Context(), token)
	ref, entries, err := fetchKnowledgeTreeHTTP(ctx, remote, r.URL.Query().Get("ref"))
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if entries == nil {
		entries = []knowledgeTreeEntry{}
	}
	writeJSON(w, http.StatusOK, knowledgeTreeResponse{
		RepoURL:     repo.URL,
		Description: repo.Description,
		Ref:         ref,
		BrowseURL:   remote.browseFile(ref, ""),
		Provider:    remote.Provider,
		Entries:     entries,
	})
}

// knowledgePathParam reads and validates the `path` query parameter shared by
// the preview and download endpoints. The Git host would reject a traversal
// path on its own, but the reject belongs here: this is the boundary that
// accepts untrusted input, and it is the one that has to hold for every
// provider.
func knowledgePathParam(w http.ResponseWriter, r *http.Request) (string, bool) {
	if strings.TrimSpace(r.URL.Query().Get("path")) == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return "", false
	}
	filePath, ok := validateKnowledgeRepoPath(r.URL.Query().Get("path"))
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid path")
		return "", false
	}
	return filePath, true
}

// validateKnowledgeRepoPath is the single traversal gate for every knowledge
// route, whether the path arrives as a query parameter or as a wildcard tail.
// The Git host would reject a traversal on its own, but the reject belongs at
// this boundary: it is the one that has to hold for every provider.
//
// ".." is rejected anywhere in the string (not just as a whole segment), which
// also rules out names like "notes..md" — the same deliberate conservatism the
// query-parameter route has always had.
func validateKnowledgeRepoPath(filePath string) (string, bool) {
	filePath = strings.TrimSpace(filePath)
	if filePath == "" || path.IsAbs(filePath) {
		return "", false
	}
	if strings.Contains(filePath, "..") || strings.ContainsRune(filePath, 0) || strings.Contains(filePath, `\`) {
		return "", false
	}
	for _, segment := range strings.Split(filePath, "/") {
		if segment == "" || segment == "." {
			return "", false
		}
	}
	return filePath, true
}

// knowledgeRef resolves the caller's `ref`, falling back to the repository's
// default branch when they did not pin one.
func knowledgeRef(w http.ResponseWriter, r *http.Request, ctx context.Context, remote gitRemote) (string, bool) {
	ref := strings.TrimSpace(r.URL.Query().Get("ref"))
	if ref != "" {
		return ref, true
	}
	resolved, err := resolveDefaultRefHTTP(ctx, remote)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return "", false
	}
	return resolved, true
}

// GetKnowledgeDownload streams one file's raw bytes as a forced attachment.
//
// The preview endpoint is deliberately lossy — it caps the body at
// knowledgeMaxFileBytes and never inlines binary media — which is what a reader
// wants and exactly what a download must not do. This endpoint hands back the
// whole blob instead, so PDFs, images and oversized documents arrive intact
// rather than as a truncated preview or a "can't preview this" notice.
func (h *Handler) GetKnowledgeDownload(w http.ResponseWriter, r *http.Request) {
	_, _, remote, token, ok := h.loadKnowledgeRepo(w, r)
	if !ok {
		return
	}
	filePath, ok := knowledgePathParam(w, r)
	if !ok {
		return
	}
	ctx := withKnowledgeToken(r.Context(), token)
	ref, ok := knowledgeRef(w, r, ctx, remote)
	if !ok {
		return
	}
	body, oversized, err := fetchKnowledgeFileDownloadHTTP(ctx, remote, ref, filePath)
	if err != nil {
		if errors.Is(err, errKnowledgeFileNotFound) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if oversized {
		writeError(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("file exceeds the %d MiB download limit", knowledgeMaxDownloadBytes>>20))
		return
	}
	// Content-Type is informational here: the attachment disposition below is
	// what stops a browser from rendering the bytes, so an .html file in the
	// knowledge base downloads rather than executing on this origin.
	w.Header().Set("Content-Type", knowledgeDownloadContentType(filePath))
	w.Header().Set("Content-Disposition", storage.AttachmentContentDisposition(path.Base(filePath)))
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(http.StatusOK)
	// The status and headers are already committed, so a write failure here has
	// nowhere to go but the client's truncated file — nothing left to report.
	_, _ = w.Write(body)
}

func knowledgeDownloadContentType(filePath string) string {
	if contentType := mime.TypeByExtension(strings.ToLower(path.Ext(filePath))); contentType != "" {
		return contentType
	}
	return "application/octet-stream"
}

func (h *Handler) GetKnowledgeFile(w http.ResponseWriter, r *http.Request) {
	workspaceID, repo, remote, token, ok := h.loadKnowledgeRepo(w, r)
	if !ok {
		return
	}
	filePath, ok := knowledgePathParam(w, r)
	if !ok {
		return
	}
	ctx := withKnowledgeToken(r.Context(), token)
	ref, ok := knowledgeRef(w, r, ctx, remote)
	if !ok {
		return
	}
	body, truncated, err := fetchKnowledgeFileHTTP(ctx, remote, ref, filePath)
	if err != nil {
		if errors.Is(err, errKnowledgeFileNotFound) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	media := classifyKnowledgeMedia(filePath, body)
	content := ""
	if media != "binary" {
		content = string(body)
		if !utf8.ValidString(content) {
			media = "binary"
			content = ""
		}
	}
	writeJSON(w, http.StatusOK, knowledgeFileResponse{
		Path:       filePath,
		Ref:        ref,
		BrowseURL:  remote.browseFile(ref, filePath),
		Media:      media,
		Truncated:  truncated,
		Size:       len(body),
		Content:    content,
		AssetsBase: knowledgeAssetsBasePath(util.UUIDToString(workspaceID), ref, repo.URL, time.Now()),
	})
}

type knowledgeBranchesResponse struct {
	Branches      []string `json:"branches"`
	DefaultBranch string   `json:"default_branch"`
}

func (h *Handler) GetKnowledgeBranches(w http.ResponseWriter, r *http.Request) {
	_, _, remote, token, ok := h.loadKnowledgeRepo(w, r)
	if !ok {
		return
	}
	names, def, err := fetchKnowledgeBranchesHTTP(withKnowledgeToken(r.Context(), token), remote)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if names == nil {
		names = []string{}
	}
	if def == "" {
		def = "main"
	}
	writeJSON(w, http.StatusOK, knowledgeBranchesResponse{
		Branches:      names,
		DefaultBranch: def,
	})
}

func classifyKnowledgeMedia(filePath string, body []byte) string {
	ext := strings.ToLower(path.Ext(filePath))
	switch ext {
	case ".md", ".markdown":
		return "markdown"
	case ".html", ".htm":
		return "html"
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".ico", ".svg":
		return "image"
	case ".pdf", ".zip", ".woff", ".woff2":
		return "binary"
	}
	if !utf8.Valid(body) {
		return "binary"
	}
	return "text"
}
