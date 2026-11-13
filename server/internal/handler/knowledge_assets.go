package handler

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/multica-ai/multica/server/internal/auth"
	"github.com/multica-ai/multica/server/internal/storage"
	"github.com/multica-ai/multica/server/internal/util"
)

const (
	// knowledgeAssetTTL bounds how long one document's asset base keeps
	// working. The file response is fetched once per open document and TanStack
	// Query keeps it for the page's lifetime, so a short-lived capability would
	// break every image in a tab left open past the TTL. The grant itself is
	// only "read one knowledge source of this workspace on one ref", which every
	// workspace member can already do while their session lasts.
	knowledgeAssetTTL = 12 * time.Hour

	// knowledgeAssetKeyDomain separates this signing domain from every other
	// HMAC the deployment derives from the same root secret.
	knowledgeAssetKeyDomain = "knowledge-assets-capability:"

	// knowledgeAssetCacheMaxAge lets a client reuse one asset response. Assets
	// are immutable per (ref, path) in practice, but the capability expires, so
	// the value stays private and modest rather than "immutable".
	knowledgeAssetCacheMaxAge = 600
)

var (
	knowledgeAssetKeyOnce sync.Once
	knowledgeAssetKey     []byte
)

// knowledgeAssetClaims is the signed capability payload. Ref is carried inside
// the token (not the query) because the token sits in the path: a <base href>
// hands relative URLs our path prefix and silently drops its own query string.
type knowledgeAssetClaims struct {
	Version   int    `json:"v"`
	Workspace string `json:"ws"`
	Ref       string `json:"ref"`
	// Repo is the knowledge source URL. Empty tokens (minted before sources
	// were selectable) resolve to the workspace's default source.
	Repo string `json:"repo,omitempty"`
	Exp  int64  `json:"exp"`
}

func knowledgeAssetSigningKey() []byte {
	knowledgeAssetKeyOnce.Do(func() {
		sum := sha256.Sum256(append([]byte(knowledgeAssetKeyDomain), auth.JWTSecret()...))
		knowledgeAssetKey = sum[:]
	})
	return knowledgeAssetKey
}

// knowledgeAssetSignature signs the ENCODED payload, JWT-style. Signing the
// encoded text keeps the message unambiguous: a git ref may contain "|" or ".",
// so joining decoded fields with a separator could be re-split differently.
func knowledgeAssetSignature(payload string) string {
	mac := hmac.New(sha256.New, knowledgeAssetSigningKey())
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func mintKnowledgeAssetToken(workspaceID, ref, repo string, now time.Time) string {
	payload, err := json.Marshal(knowledgeAssetClaims{
		Version:   1,
		Workspace: workspaceID,
		Ref:       ref,
		Repo:      repo,
		Exp:       now.Add(knowledgeAssetTTL).Unix(),
	})
	if err != nil {
		// Marshalling three strings and an int cannot fail; treat a failure as
		// "no capability" rather than panicking a request.
		return ""
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	return encoded + "." + knowledgeAssetSignature(encoded)
}

// verifyKnowledgeAssetToken fails closed on every path: malformed token, bad
// signature, unsupported version, missing scope, and elapsed expiry.
func verifyKnowledgeAssetToken(token string, now time.Time) (knowledgeAssetClaims, bool) {
	var claims knowledgeAssetClaims
	payload, sig, ok := strings.Cut(token, ".")
	if !ok || payload == "" || sig == "" {
		return claims, false
	}
	want, err := base64.RawURLEncoding.DecodeString(knowledgeAssetSignature(payload))
	if err != nil {
		return claims, false
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(got, want) {
		return claims, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return claims, false
	}
	if err := json.Unmarshal(raw, &claims); err != nil {
		return claims, false
	}
	if claims.Version != 1 || claims.Workspace == "" || claims.Ref == "" {
		return claims, false
	}
	if now.Unix() > claims.Exp {
		return claims, false
	}
	return claims, true
}

// knowledgeAssetsBasePath is the site-relative prefix a client resolves the
// document's sibling assets against. Clients prefix it with their API base, so
// web deployments that proxy /api stay same-origin and desktop clients get an
// absolute URL.
func knowledgeAssetsBasePath(workspaceID, ref, repo string, now time.Time) string {
	token := mintKnowledgeAssetToken(workspaceID, ref, repo, now)
	if token == "" {
		return ""
	}
	return "/api/workspaces/" + workspaceID + "/knowledge/assets/" + token + "/"
}

// ServeKnowledgeAsset — GET /api/workspaces/{id}/knowledge/assets/{token}/*
//
// Public by necessity, like /api/avatars/{sig}/*: the capability in the path IS
// the credential. A desktop renderer runs on file:// with a bearer token and no
// API cookie, so a native <img>/<link> subresource carries no credentials at
// all; and an HTML preview resolves sibling files against a <base href> that
// cannot carry a query signature. The token is minted only by the authenticated
// GET /knowledge/file after its membership check, and it grants read of one
// workspace's knowledge repo on one ref for knowledgeAssetTTL.
func (h *Handler) ServeKnowledgeAsset(w http.ResponseWriter, r *http.Request) {
	claims, ok := verifyKnowledgeAssetToken(chi.URLParam(r, "token"), time.Now())
	if !ok {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	routeID, err := util.ParseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	// Compare parsed bytes so an uppercase spelling of the same UUID still
	// matches the canonical form the token was minted with.
	claimsID, err := util.ParseUUID(claims.Workspace)
	if err != nil || claimsID.Bytes != routeID.Bytes {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	filePath, ok := knowledgeAssetFilePath(r)
	if !ok {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	_, remote, token, ok := h.loadKnowledgeRepoForWorkspace(r.Context(), w, routeID, claims.Repo, true)
	if !ok {
		return
	}
	ctx := withKnowledgeToken(r.Context(), token)
	body, oversized, err := fetchKnowledgeFileDownloadHTTP(ctx, remote, claims.Ref, filePath)
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
			"file exceeds the download limit")
		return
	}
	contentType := knowledgeDownloadContentType(filePath)
	w.Header().Set("Content-Type", contentType)
	// Load-bearing on a public route: inline is granted only to media types
	// browsers render safely. SVG, HTML, JS and CSS keep the attachment
	// disposition, which is what stops a repository file from executing as a
	// document on this origin. Subresource loads ignore the header, so an
	// <img src> still renders an SVG (checked in Chromium: an attachment SVG
	// loads with its natural size) while a direct navigation downloads it.
	w.Header().Set("Content-Disposition", storage.ContentDisposition(contentType, path.Base(filePath)))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// The capability lives in the path; a document or stylesheet that pulls a
	// third-party subresource would otherwise leak it in Referer.
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "private, max-age="+strconv.Itoa(knowledgeAssetCacheMaxAge))
	http.ServeContent(w, r, path.Base(filePath), time.Time{}, bytes.NewReader(body))
}

// knowledgeAssetFilePath reads the wildcard tail as a repository path.
//
// chi matches r.URL.RawPath when the request carried an escaped path and
// r.URL.Path otherwise, so the value is escaped in the first case and already
// decoded in the second. Unescaping unconditionally would reject a legitimate
// "100%.png" (canonical escaping leaves RawPath empty, and "%" alone does not
// unescape) and — worse — would turn "%252e%252e" into ".." after two passes.
func knowledgeAssetFilePath(r *http.Request) (string, bool) {
	raw := chi.URLParam(r, "*")
	if r.URL.RawPath != "" {
		decoded, err := url.PathUnescape(raw)
		if err != nil {
			return "", false
		}
		raw = decoded
	}
	return validateKnowledgeRepoPath(raw)
}
