package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/multica-ai/multica/server/internal/storage"
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

func isKnowledgeDescription(description string) bool {
	lower := strings.ToLower(description)
	return strings.Contains(description, "知识库") || strings.Contains(lower, "knowledge")
}

func (h *Handler) loadKnowledgeRepo(w http.ResponseWriter, r *http.Request) (workspaceRepoRef, gitRemote, bool) {
	workspaceID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "workspace_id")
	if !ok {
		return workspaceRepoRef{}, gitRemote{}, false
	}
	ws, err := h.Queries.GetWorkspace(r.Context(), workspaceID)
	if err != nil {
		writeError(w, http.StatusNotFound, "workspace not found")
		return workspaceRepoRef{}, gitRemote{}, false
	}
	var repos []workspaceRepoRef
	if len(ws.Repos) > 0 {
		if err := json.Unmarshal(ws.Repos, &repos); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read workspace repositories")
			return workspaceRepoRef{}, gitRemote{}, false
		}
	}
	repo, ok := pickKnowledgeRepo(repos)
	if !ok {
		writeErrorCode(w, http.StatusNotFound, "knowledge_repo_not_configured", "no knowledge repository configured; add a workspace repo whose description contains 知识库 or knowledge")
		return workspaceRepoRef{}, gitRemote{}, false
	}
	remote, err := parseGitRemote(repo.URL)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return workspaceRepoRef{}, gitRemote{}, false
	}
	return repo, remote, true
}

func (h *Handler) GetKnowledgeTree(w http.ResponseWriter, r *http.Request) {
	repo, remote, ok := h.loadKnowledgeRepo(w, r)
	if !ok {
		return
	}
	ref, entries, err := fetchKnowledgeTreeHTTP(r.Context(), remote, r.URL.Query().Get("ref"))
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
	filePath := strings.TrimSpace(r.URL.Query().Get("path"))
	if filePath == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return "", false
	}
	if path.IsAbs(filePath) || strings.Contains(filePath, "..") {
		writeError(w, http.StatusBadRequest, "invalid path")
		return "", false
	}
	return filePath, true
}

// knowledgeRef resolves the caller's `ref`, falling back to the repository's
// default branch when they did not pin one.
func knowledgeRef(w http.ResponseWriter, r *http.Request, remote gitRemote) (string, bool) {
	ref := strings.TrimSpace(r.URL.Query().Get("ref"))
	if ref != "" {
		return ref, true
	}
	resolved, err := resolveDefaultRefHTTP(r.Context(), remote)
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
	_, remote, ok := h.loadKnowledgeRepo(w, r)
	if !ok {
		return
	}
	filePath, ok := knowledgePathParam(w, r)
	if !ok {
		return
	}
	ref, ok := knowledgeRef(w, r, remote)
	if !ok {
		return
	}
	body, oversized, err := fetchKnowledgeFileDownloadHTTP(r.Context(), remote, ref, filePath)
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
	_, remote, ok := h.loadKnowledgeRepo(w, r)
	if !ok {
		return
	}
	filePath, ok := knowledgePathParam(w, r)
	if !ok {
		return
	}
	ref, ok := knowledgeRef(w, r, remote)
	if !ok {
		return
	}
	body, truncated, err := fetchKnowledgeFileHTTP(r.Context(), remote, ref, filePath)
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
		Path:      filePath,
		Ref:       ref,
		BrowseURL: remote.browseFile(ref, filePath),
		Media:     media,
		Truncated: truncated,
		Size:      len(body),
		Content:   content,
	})
}

type knowledgeBranchesResponse struct {
	Branches      []string `json:"branches"`
	DefaultBranch string   `json:"default_branch"`
}

func (h *Handler) GetKnowledgeBranches(w http.ResponseWriter, r *http.Request) {
	_, remote, ok := h.loadKnowledgeRepo(w, r)
	if !ok {
		return
	}
	names, def, err := fetchKnowledgeBranchesHTTP(r.Context(), remote)
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
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".zip", ".woff", ".woff2":
		return "binary"
	}
	if !utf8.Valid(body) {
		return "binary"
	}
	return "text"
}
