package handler

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/multica-ai/multica/server/internal/testutil"
)

func TestKnowledgeAssetTokenRoundTrip(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	ws := "11112222-3333-4444-5555-666677778888"
	// A ref may contain "|" and "." — the token signs the encoded payload, so
	// neither can be re-split into different fields.
	ref := "release/0.7|kb.1"

	token := mintKnowledgeAssetToken(ws, ref, now)
	if token == "" {
		t.Fatal("mintKnowledgeAssetToken returned an empty token")
	}
	claims, ok := verifyKnowledgeAssetToken(token, now.Add(time.Hour))
	if !ok {
		t.Fatalf("fresh token did not verify: %q", token)
	}
	if claims.Workspace != ws || claims.Ref != ref {
		t.Fatalf("claims = %+v, want ws=%q ref=%q", claims, ws, ref)
	}
	if claims.Exp <= now.Unix() {
		t.Fatalf("exp = %d, want a future expiry", claims.Exp)
	}

	if _, ok := verifyKnowledgeAssetToken(token, now.Add(knowledgeAssetTTL-time.Minute)); !ok {
		// The token must survive its whole TTL window.
		t.Fatal("token expired before its TTL elapsed")
	}
	if _, ok := verifyKnowledgeAssetToken(token, now.Add(knowledgeAssetTTL+time.Minute)); ok {
		t.Fatal("token still verified after its TTL elapsed")
	}
}

func TestKnowledgeAssetTokenRejectsTampering(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	token := mintKnowledgeAssetToken("11112222-3333-4444-5555-666677778888", "main", now)
	payload, sig, ok := strings.Cut(token, ".")
	if !ok {
		t.Fatalf("token %q has no signature separator", token)
	}

	forgedPayload := base64.RawURLEncoding.EncodeToString([]byte(
		`{"v":1,"ws":"99992222-3333-4444-5555-666677778888","ref":"main","exp":1800003600}`,
	))

	cases := map[string]string{
		"empty":          "",
		"no separator":   payload,
		"empty payload":  "." + sig,
		"empty sig":      payload + ".",
		"tampered payload": forgedPayload + "." + sig,
		"tampered sig":   payload + "." + base64.RawURLEncoding.EncodeToString([]byte("not-the-signature")),
		"unparsable sig": payload + ".!!!",
		"unparsable body": "!!!." + sig,
	}
	for name, candidate := range cases {
		if _, ok := verifyKnowledgeAssetToken(candidate, now); ok {
			t.Errorf("%s: token verified, want rejection", name)
		}
	}
}

func TestKnowledgeAssetTokenRejectsIncompleteClaims(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	for name, payload := range map[string]string{
		"empty workspace": `{"v":1,"ws":"","ref":"main","exp":1800003600}`,
		"empty ref":       `{"v":1,"ws":"11112222-3333-4444-5555-666677778888","ref":"","exp":1800003600}`,
		"wrong version":   `{"v":2,"ws":"11112222-3333-4444-5555-666677778888","ref":"main","exp":1800003600}`,
	} {
		encoded := base64.RawURLEncoding.EncodeToString([]byte(payload))
		token := encoded + "." + knowledgeAssetSignature(encoded)
		if _, ok := verifyKnowledgeAssetToken(token, now); ok {
			t.Errorf("%s: token verified, want rejection", name)
		}
	}
}

func TestKnowledgeAssetsBasePath(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	base := knowledgeAssetsBasePath("11112222-3333-4444-5555-666677778888", "main", now)
	if !strings.HasPrefix(base, "/api/workspaces/11112222-3333-4444-5555-666677778888/knowledge/assets/") {
		t.Fatalf("base = %q, want the site-relative asset prefix", base)
	}
	if !strings.HasSuffix(base, "/") {
		t.Fatalf("base = %q, want a trailing slash so relative URLs append cleanly", base)
	}
	token := strings.TrimSuffix(strings.TrimPrefix(base, "/api/workspaces/11112222-3333-4444-5555-666677778888/knowledge/assets/"), "/")
	claims, ok := verifyKnowledgeAssetToken(token, now)
	if !ok {
		t.Fatalf("base %q does not carry a valid token", base)
	}
	if claims.Workspace != "11112222-3333-4444-5555-666677778888" || claims.Ref != "main" {
		t.Fatalf("claims = %+v, want the workspace and ref it was minted for", claims)
	}
}

// serveAssetRequest drives the public route exactly the way router.go
// registers it, so chi's wildcard/escaping behavior is part of what is tested.
func serveAssetRequest(t *testing.T, workspaceID, token, assetPath string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Get("/api/workspaces/{id}/knowledge/assets/{token}/*", testHandler.ServeKnowledgeAsset)
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspaceID+"/knowledge/assets/"+token+"/"+assetPath, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestServeKnowledgeAssetRejectsBadToken(t *testing.T) {
	if testHandler == nil {
		t.Skip("requires handler")
	}
	workspaceID := "11112222-3333-4444-5555-666677778888"
	now := time.Now()
	expired := mintKnowledgeAssetToken(workspaceID, "main", now.Add(-knowledgeAssetTTL-time.Hour))
	otherWorkspace := mintKnowledgeAssetToken("99992222-3333-4444-5555-666677778888", "main", now)
	valid := mintKnowledgeAssetToken(workspaceID, "main", now)

	for name, tc := range map[string]struct {
		workspaceID string
		token       string
	}{
		"empty token":     {workspaceID: workspaceID, token: "x"},
		"expired":         {workspaceID: workspaceID, token: expired},
		"other workspace": {workspaceID: workspaceID, token: otherWorkspace},
		"non-uuid route":  {workspaceID: "not-a-uuid", token: valid},
	} {
		w := serveAssetRequest(t, tc.workspaceID, tc.token, "images/logo.png")
		if w.Code != http.StatusNotFound {
			t.Errorf("%s: status = %d, want 404", name, w.Code)
		}
	}
}

// A valid capability must never reach the network for a path it must reject.
func TestServeKnowledgeAssetRejectsUnsafePaths(t *testing.T) {
	if testHandler == nil {
		t.Skip("requires handler")
	}
	workspaceID := "11112222-3333-4444-5555-666677778888"
	token := mintKnowledgeAssetToken(workspaceID, "main", time.Now())

	for name, assetPath := range map[string]string{
		"parent":            "%2e%2e/secret.png",
		"parent mid-path":   "images/%2e%2e/../secret.png",
		"absolute":          "%2Fetc%2Fpasswd",
		"encoded traversal": "%252e%252e%252fsecret.png",
	} {
		w := serveAssetRequest(t, workspaceID, token, assetPath)
		if w.Code != http.StatusNotFound {
			t.Errorf("%s: status = %d, want 404 before any upstream fetch", name, w.Code)
		}
	}
}

func TestServeKnowledgeAssetServesImageInline(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("requires DB")
	}
	pixels := "\x89PNG\r\n\x1a\nfake-image-bytes"
	requests := 0
	stubKnowledgeClients(t, &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		requests++
		if !strings.HasSuffix(req.URL.Path, "/contents/images/logo.png") {
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
		return textResponse(http.StatusOK, pixels), nil
	})})

	workspaceID := dbfx.Workspace(t,
		"Knowledge asset image "+t.Name(),
		"kb-asset-image-"+strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-")),
		testutil.Cols{
			"repos": testutil.Raw(`'[{"url":"https://github.com/acme/kb.git","description":"知识库"}]'::jsonb`),
		},
	)
	token := mintKnowledgeAssetToken(workspaceID, "main", time.Now())

	w := serveAssetRequest(t, workspaceID, token, "images/logo.png")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", w.Code, w.Body.String())
	}
	if got := w.Header().Get("Content-Type"); !strings.HasPrefix(got, "image/png") {
		t.Errorf("Content-Type = %q, want image/png", got)
	}
	if got := w.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "inline;") {
		t.Errorf("Content-Disposition = %q, want inline for an image", got)
	}
	if got := w.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("X-Content-Type-Options = %q, want nosniff", got)
	}
	if got := w.Header().Get("Referrer-Policy"); got != "no-referrer" {
		t.Errorf("Referrer-Policy = %q, want no-referrer (the token is in the path)", got)
	}
	if got := w.Body.String(); got != pixels {
		t.Errorf("body = %q, want the raw bytes", got)
	}
	if requests != 1 {
		t.Errorf("upstream requests = %d, want 1", requests)
	}
}

// Documents that could execute on this origin keep the attachment disposition;
// the route is public, so that is the load-bearing XSS control.
func TestServeKnowledgeAssetForcesAttachmentForDocuments(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("requires DB")
	}
	stubKnowledgeClients(t, &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return textResponse(http.StatusOK, "<script>alert(1)</script>"), nil
	})})

	workspaceID := dbfx.Workspace(t,
		"Knowledge asset documents "+t.Name(),
		"kb-asset-docs-"+strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-")),
		testutil.Cols{
			"repos": testutil.Raw(`'[{"url":"https://github.com/acme/kb.git","description":"知识库"}]'::jsonb`),
		},
	)
	token := mintKnowledgeAssetToken(workspaceID, "main", time.Now())

	for _, assetPath := range []string{"docs/page.html", "images/logo.svg"} {
		w := serveAssetRequest(t, workspaceID, token, assetPath)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: status = %d, want 200", assetPath, w.Code)
		}
		if got := w.Header().Get("Content-Disposition"); !strings.HasPrefix(got, "attachment;") {
			t.Errorf("%s: Content-Disposition = %q, want attachment", assetPath, got)
		}
	}
}

func TestServeKnowledgeAssetSupportsRange(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("requires DB")
	}
	body := "0123456789"
	stubKnowledgeClients(t, &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return textResponse(http.StatusOK, body), nil
	})})

	workspaceID := dbfx.Workspace(t,
		"Knowledge asset range "+t.Name(),
		"kb-asset-range-"+strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-")),
		testutil.Cols{
			"repos": testutil.Raw(`'[{"url":"https://github.com/acme/kb.git","description":"知识库"}]'::jsonb`),
		},
	)
	token := mintKnowledgeAssetToken(workspaceID, "main", time.Now())

	r := chi.NewRouter()
	r.Get("/api/workspaces/{id}/knowledge/assets/{token}/*", testHandler.ServeKnowledgeAsset)
	req := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+workspaceID+"/knowledge/assets/"+token+"/images/a.png", nil)
	req.Header.Set("Range", "bytes=0-3")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusPartialContent {
		t.Fatalf("status = %d, want 206 for a ranged request", w.Code)
	}
	if got := w.Body.String(); got != "0123" {
		t.Errorf("body = %q, want the requested range", got)
	}
}

func TestGetKnowledgeFileExposesAssetsBase(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("requires DB")
	}
	stubKnowledgeClients(t, &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(req.URL.Path, "/contents/docs/guide.md") {
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
		return textResponse(http.StatusOK, "# Guide"), nil
	})})

	workspaceID := dbfx.Workspace(t,
		"Knowledge assets base "+t.Name(),
		"kb-assets-base-"+strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-")),
		testutil.Cols{
			"repos": testutil.Raw(`'[{"url":"https://github.com/acme/kb.git","description":"知识库"}]'::jsonb`),
		},
	)

	req := newRequest("GET", "/api/workspaces/"+workspaceID+"/knowledge/file?path=docs/guide.md&ref=main", nil)
	req = withURLParam(req, "id", workspaceID)
	resp := testutil.Call(t, testHandler.GetKnowledgeFile, req).Want(http.StatusOK)

	var out knowledgeFileResponse
	resp.JSON(&out)
	if out.AssetsBase == "" {
		t.Fatal("assets_base is empty")
	}
	prefix := "/api/workspaces/" + workspaceID + "/knowledge/assets/"
	if !strings.HasPrefix(out.AssetsBase, prefix) || !strings.HasSuffix(out.AssetsBase, "/") {
		t.Fatalf("assets_base = %q, want %q…/", out.AssetsBase, prefix)
	}
	token := strings.TrimSuffix(strings.TrimPrefix(out.AssetsBase, prefix), "/")
	claims, ok := verifyKnowledgeAssetToken(token, time.Now())
	if !ok {
		t.Fatalf("assets_base %q does not carry a valid token", out.AssetsBase)
	}
	if claims.Workspace != workspaceID || claims.Ref != "main" {
		t.Fatalf("claims = %+v, want the route workspace and the resolved ref", claims)
	}
}
