package handler

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/multica-ai/multica/server/internal/testutil"
)

func TestPickKnowledgeRepo(t *testing.T) {
	tagged, ok := pickKnowledgeRepo([]workspaceRepoRef{
		{URL: "https://git.example/code.git", Description: "backend"},
		{URL: "https://git.example/kb.git", Description: "工作区知识库"},
	})
	if !ok || tagged.URL != "https://git.example/kb.git" {
		t.Fatalf("got %+v ok=%v", tagged, ok)
	}

	solo, ok := pickKnowledgeRepo([]workspaceRepoRef{{URL: "https://git.example/solo.git"}})
	if !ok || solo.URL != "https://git.example/solo.git" {
		t.Fatalf("solo fallback failed: %+v ok=%v", solo, ok)
	}

	if _, ok := pickKnowledgeRepo([]workspaceRepoRef{
		{URL: "https://git.example/a.git"},
		{URL: "https://git.example/b.git"},
	}); ok {
		t.Fatal("expected no pick when multiple untagged repos")
	}
}

func TestParseGitRemote(t *testing.T) {
	gh, err := parseGitRemote("https://github.com/acme/kb.git")
	if err != nil {
		t.Fatal(err)
	}
	if gh.Provider != "github" || gh.Owner != "acme" || gh.Repo != "kb" {
		t.Fatalf("github parse: %+v", gh)
	}

	t.Setenv("KNOWLEDGE_GIT_PROVIDER", "")
	ssh, err := parseGitRemote("git@git.example.com:team/docs.git")
	if err != nil {
		t.Fatal(err)
	}
	if ssh.Provider != "gitea" || ssh.Host != "git.example.com" || ssh.Owner != "team" || ssh.Repo != "docs" {
		t.Fatalf("ssh parse: %+v", ssh)
	}

	gl, err := parseGitRemote("https://git.lianjia.com/lft/lft-account/byz_workspace.git")
	if err != nil {
		t.Fatal(err)
	}
	if gl.Provider != "gitlab" || gl.Host != "git.lianjia.com" || gl.Owner != "lft/lft-account" || gl.Repo != "byz_workspace" {
		t.Fatalf("gitlab nested parse: %+v", gl)
	}
	if gl.projectPath() != "lft/lft-account/byz_workspace" {
		t.Fatalf("projectPath: %s", gl.projectPath())
	}
	if got := gl.browseFile("master", "01-贝易转/_overview.md"); got != "https://git.lianjia.com/lft/lft-account/byz_workspace/-/blob/master/01-贝易转/_overview.md" {
		t.Fatalf("browseFile: %s", got)
	}

	t.Setenv("KNOWLEDGE_GIT_PROVIDER", "gitlab")
	forced, err := parseGitRemote("https://git.example.com/group/docs.git")
	if err != nil {
		t.Fatal(err)
	}
	if forced.Provider != "gitlab" {
		t.Fatalf("KNOWLEDGE_GIT_PROVIDER override: %+v", forced)
	}
}

func TestClassifyKnowledgeMedia(t *testing.T) {
	if got := classifyKnowledgeMedia("a.md", []byte("# hi")); got != "markdown" {
		t.Fatalf("md: %s", got)
	}
	if got := classifyKnowledgeMedia("a.html", []byte("<p>hi</p>")); got != "html" {
		t.Fatalf("html: %s", got)
	}
	if got := classifyKnowledgeMedia("a.htm", []byte("<p>hi</p>")); got != "html" {
		t.Fatalf("htm: %s", got)
	}
	if got := classifyKnowledgeMedia("a.png", []byte("xxxx")); got != "binary" {
		t.Fatalf("png: %s", got)
	}
}

func TestFetchKnowledgeTreeAndFileHTTP(t *testing.T) {
	prev := knowledgeHTTPClient
	t.Cleanup(func() { knowledgeHTTPClient = prev })
	knowledgeHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		path := req.URL.Path
		switch {
		case strings.HasSuffix(path, "/repos/acme/kb") && !strings.Contains(path, "/git/") && !strings.Contains(path, "/contents/"):
			return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
		case strings.Contains(path, "/git/trees/main"):
			return jsonResponse(http.StatusOK, `{"tree":[{"path":"README.md","type":"blob","size":12},{"path":"img.png","type":"blob","size":4}]}`), nil
		case strings.Contains(path, "/contents/README.md"):
			if req.Header.Get("Accept") != "application/vnd.github.raw" {
				t.Errorf("expected raw accept, got %q", req.Header.Get("Accept"))
			}
			return textResponse(http.StatusOK, "# hello"), nil
		default:
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
	})}

	remote := gitRemote{Host: "github.com", Owner: "acme", Repo: "kb", Provider: "github"}
	ref, entries, err := fetchKnowledgeTreeHTTP(context.Background(), remote, "")
	if err != nil {
		t.Fatal(err)
	}
	if ref != "main" || len(entries) != 2 || entries[0].Path != "README.md" {
		t.Fatalf("tree: ref=%s entries=%+v", ref, entries)
	}

	body, truncated, err := fetchKnowledgeFileHTTP(context.Background(), remote, "main", "README.md")
	if err != nil {
		t.Fatal(err)
	}
	if truncated || string(body) != "# hello" {
		t.Fatalf("file: truncated=%v body=%q", truncated, body)
	}
}

func TestFetchGitLabKnowledgeTreeAndFileHTTP(t *testing.T) {
	t.Setenv("KNOWLEDGE_GIT_TOKEN", "glpat-test")
	prev := knowledgeHTTPClient
	t.Cleanup(func() { knowledgeHTTPClient = prev })
	knowledgeHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Header.Get("PRIVATE-TOKEN") != "glpat-test" {
			t.Errorf("expected PRIVATE-TOKEN, got %q", req.Header.Get("PRIVATE-TOKEN"))
		}
		escaped := req.URL.EscapedPath()
		switch {
		case strings.Contains(escaped, "/api/v4/projects/lft%2Flft-account%2Fbyz_workspace") && !strings.Contains(escaped, "/repository/"):
			return jsonResponse(http.StatusOK, `{"default_branch":"master"}`), nil
		case strings.Contains(escaped, "/repository/tree"):
			page := req.URL.Query().Get("page")
			if page == "1" {
				resp := jsonResponse(http.StatusOK, `[{"path":"01-贝易转","type":"tree"},{"path":"01-贝易转/_overview.md","type":"blob"}]`)
				resp.Header.Set("X-Next-Page", "2")
				return resp, nil
			}
			return jsonResponse(http.StatusOK, `[{"path":"README.md","type":"blob"}]`), nil
		case strings.Contains(escaped, "/repository/files/") && strings.HasSuffix(escaped, "/raw"):
			return textResponse(http.StatusOK, "# 贝易转"), nil
		default:
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
	})}

	remote := gitRemote{Host: "git.lianjia.com", Owner: "lft/lft-account", Repo: "byz_workspace", Provider: "gitlab"}
	ref, entries, err := fetchKnowledgeTreeHTTP(context.Background(), remote, "")
	if err != nil {
		t.Fatal(err)
	}
	if ref != "master" || len(entries) != 3 || entries[1].Path != "01-贝易转/_overview.md" {
		t.Fatalf("tree: ref=%s entries=%+v", ref, entries)
	}

	body, truncated, err := fetchKnowledgeFileHTTP(context.Background(), remote, "master", "01-贝易转/_overview.md")
	if err != nil {
		t.Fatal(err)
	}
	if truncated || string(body) != "# 贝易转" {
		t.Fatalf("file: truncated=%v body=%q", truncated, body)
	}
}

func TestFetchKnowledgeBranchesHTTP(t *testing.T) {
	prev := knowledgeHTTPClient
	t.Cleanup(func() { knowledgeHTTPClient = prev })
	knowledgeHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		path := req.URL.Path
		switch {
		case strings.HasSuffix(path, "/repos/acme/kb/branches"):
			return jsonResponse(http.StatusOK, `[{"name":"main"},{"name":"feature/x"}]`), nil
		case strings.HasSuffix(path, "/repos/acme/kb") && !strings.Contains(path, "/git/") && !strings.Contains(path, "/contents/") && !strings.Contains(path, "/branches"):
			return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
		default:
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
	})}

	remote := gitRemote{Host: "github.com", Owner: "acme", Repo: "kb", Provider: "github"}
	names, def, err := fetchKnowledgeBranchesHTTP(context.Background(), remote)
	if err != nil {
		t.Fatal(err)
	}
	if def != "main" || len(names) != 2 || names[0] != "main" || names[1] != "feature/x" {
		t.Fatalf("branches: def=%s names=%+v", def, names)
	}
}

func TestFetchGitLabBranchesPaginates(t *testing.T) {
	t.Setenv("KNOWLEDGE_GIT_TOKEN", "glpat-test")
	prev := knowledgeHTTPClient
	t.Cleanup(func() { knowledgeHTTPClient = prev })
	knowledgeHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Header.Get("PRIVATE-TOKEN") != "glpat-test" {
			t.Errorf("expected PRIVATE-TOKEN, got %q", req.Header.Get("PRIVATE-TOKEN"))
		}
		escaped := req.URL.EscapedPath()
		switch {
		case strings.Contains(escaped, "/repository/branches"):
			page := req.URL.Query().Get("page")
			if page == "1" {
				resp := jsonResponse(http.StatusOK, `[{"name":"main"},{"name":"dev"}]`)
				resp.Header.Set("X-Next-Page", "2")
				return resp, nil
			}
			return jsonResponse(http.StatusOK, `[{"name":"feature/x"}]`), nil
		case strings.Contains(escaped, "/api/v4/projects/lft%2Flft-account%2Fbyz_workspace") && !strings.Contains(escaped, "/repository/"):
			return jsonResponse(http.StatusOK, `{"default_branch":"master"}`), nil
		default:
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
	})}

	remote := gitRemote{Host: "git.lianjia.com", Owner: "lft/lft-account", Repo: "byz_workspace", Provider: "gitlab"}
	names, def, err := fetchKnowledgeBranchesHTTP(context.Background(), remote)
	if err != nil {
		t.Fatal(err)
	}
	if def != "master" || len(names) != 3 || names[2] != "feature/x" {
		t.Fatalf("branches: def=%s names=%+v", def, names)
	}
}

func TestFetchKnowledgeBranchesAuthFailure(t *testing.T) {
	prev := knowledgeHTTPClient
	t.Cleanup(func() { knowledgeHTTPClient = prev })
	knowledgeHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return jsonResponse(http.StatusUnauthorized, `{"message":"auth required"}`), nil
	})}

	remote := gitRemote{Host: "github.com", Owner: "acme", Repo: "kb", Provider: "github"}
	_, _, err := fetchKnowledgeBranchesHTTP(context.Background(), remote)
	if err == nil {
		t.Fatal("expected error on 401 response")
	}
}

func TestFetchKnowledgeTreeWithRefOverride(t *testing.T) {
	var defaultRefCalled bool
	prev := knowledgeHTTPClient
	t.Cleanup(func() { knowledgeHTTPClient = prev })
	knowledgeHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		path := req.URL.Path
		switch {
		case strings.HasSuffix(path, "/repos/acme/kb") && !strings.Contains(path, "/git/") && !strings.Contains(path, "/contents/") && !strings.Contains(path, "/branches"):
			defaultRefCalled = true
			return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
		case strings.Contains(path, "/git/trees/dev"):
			if !strings.Contains(req.URL.RawQuery, "recursive=1") {
				t.Errorf("expected recursive=1, got %q", req.URL.RawQuery)
			}
			return jsonResponse(http.StatusOK, `{"tree":[{"path":"dev.md","type":"blob","size":3}]}`), nil
		default:
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
	})}

	remote := gitRemote{Host: "github.com", Owner: "acme", Repo: "kb", Provider: "github"}
	ref, entries, err := fetchKnowledgeTreeHTTP(context.Background(), remote, "dev")
	if err != nil {
		t.Fatal(err)
	}
	if ref != "dev" || len(entries) != 1 || entries[0].Path != "dev.md" {
		t.Fatalf("tree: ref=%s entries=%+v", ref, entries)
	}
	if defaultRefCalled {
		t.Fatal("resolveDefaultRefHTTP should not be called when ref override is provided")
	}
}

func TestFetchGitLabTreeWithRefOverride(t *testing.T) {
	var defaultRefCalled bool
	t.Setenv("KNOWLEDGE_GIT_TOKEN", "glpat-test")
	prev := knowledgeHTTPClient
	t.Cleanup(func() { knowledgeHTTPClient = prev })
	knowledgeHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		escaped := req.URL.EscapedPath()
		switch {
		case strings.Contains(escaped, "/api/v4/projects/lft%2Flft-account%2Fbyz_workspace") && !strings.Contains(escaped, "/repository/"):
			defaultRefCalled = true
			return jsonResponse(http.StatusOK, `{"default_branch":"master"}`), nil
		case strings.Contains(escaped, "/repository/tree"):
			if req.URL.Query().Get("ref") != "dev" {
				t.Errorf("expected ref=dev, got %q", req.URL.Query().Get("ref"))
			}
			return jsonResponse(http.StatusOK, `[{"path":"dev.md","type":"blob"}]`), nil
		default:
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
	})}

	remote := gitRemote{Host: "git.lianjia.com", Owner: "lft/lft-account", Repo: "byz_workspace", Provider: "gitlab"}
	ref, entries, err := fetchKnowledgeTreeHTTP(context.Background(), remote, "dev")
	if err != nil {
		t.Fatal(err)
	}
	if ref != "dev" || len(entries) != 1 || entries[0].Path != "dev.md" {
		t.Fatalf("tree: ref=%s entries=%+v", ref, entries)
	}
	if defaultRefCalled {
		t.Fatal("resolveDefaultRefHTTP should not be called when ref override is provided")
	}
}

func TestFetchKnowledgeFileWithRefOverride(t *testing.T) {
	prev := knowledgeHTTPClient
	t.Cleanup(func() { knowledgeHTTPClient = prev })
	knowledgeHTTPClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		path := req.URL.Path
		switch {
		case strings.HasSuffix(path, "/repos/acme/kb") && !strings.Contains(path, "/git/") && !strings.Contains(path, "/contents/") && !strings.Contains(path, "/branches"):
			return jsonResponse(http.StatusOK, `{"default_branch":"main"}`), nil
		case strings.Contains(path, "/contents/DEV.md"):
			if req.URL.Query().Get("ref") != "dev" {
				t.Errorf("expected ref=dev, got %q", req.URL.Query().Get("ref"))
			}
			return textResponse(http.StatusOK, "# dev branch"), nil
		default:
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
	})}

	remote := gitRemote{Host: "github.com", Owner: "acme", Repo: "kb", Provider: "github"}
	body, _, err := fetchKnowledgeFileHTTP(context.Background(), remote, "dev", "DEV.md")
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "# dev branch" {
		t.Fatalf("file body=%q", body)
	}
}

// stubKnowledgeClients points both knowledge HTTP clients at one fake Git host
// for the duration of a test. The preview and download paths use different
// clients (different timeouts), so a test that exercises either has to swap the
// one it drives — and swapping both keeps a test from silently measuring the
// real network when it drives the other.
func stubKnowledgeClients(t *testing.T, fake *http.Client) {
	t.Helper()
	prevPreview, prevDownload := knowledgeHTTPClient, knowledgeDownloadHTTPClient
	t.Cleanup(func() {
		knowledgeHTTPClient = prevPreview
		knowledgeDownloadHTTPClient = prevDownload
	})
	knowledgeHTTPClient, knowledgeDownloadHTTPClient = fake, fake
}

// The preview stops at knowledgeMaxFileBytes and reports it; a download that
// stopped there would hand the user a file that ends mid-document with nothing
// saying so. This is the boundary between the two.
func TestFetchKnowledgeFileDownloadHTTPIgnoresPreviewCap(t *testing.T) {
	body := strings.Repeat("x", knowledgeMaxFileBytes+512)
	stubKnowledgeClients(t, &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if !strings.Contains(req.URL.Path, "/contents/") {
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
		return textResponse(http.StatusOK, body), nil
	})})

	remote := gitRemote{Host: "github.com", Owner: "acme", Repo: "kb", Provider: "github"}

	preview, truncated, err := fetchKnowledgeFileHTTP(context.Background(), remote, "main", "big.md")
	if err != nil {
		t.Fatal(err)
	}
	if !truncated || len(preview) != knowledgeMaxFileBytes {
		t.Fatalf("preview: truncated=%v len=%d, want truncated at %d", truncated, len(preview), knowledgeMaxFileBytes)
	}

	full, oversized, err := fetchKnowledgeFileDownloadHTTP(context.Background(), remote, "main", "big.md")
	if err != nil {
		t.Fatal(err)
	}
	if oversized {
		t.Fatalf("download: reported oversized for a %d byte body under the %d byte limit", len(body), knowledgeMaxDownloadBytes)
	}
	if string(full) != body {
		t.Fatalf("download: body len=%d, want %d", len(full), len(body))
	}
}

// readKnowledgeBody's extra byte is the whole reason an exactly-at-limit file
// is not reported as oversized. Both sides of that edge are asserted because
// each has its own failure: off-by-one either truncates a complete file or
// ships a partial one.
func TestReadKnowledgeBodyReportsOverflowPastLimit(t *testing.T) {
	over, oversized, err := readKnowledgeBody(strings.NewReader("hello"), 4)
	if err != nil {
		t.Fatal(err)
	}
	if !oversized || string(over) != "hell" {
		t.Fatalf("over limit: oversized=%v body=%q, want oversized with %q", oversized, over, "hell")
	}

	exact, oversized, err := readKnowledgeBody(strings.NewReader("hello"), 5)
	if err != nil {
		t.Fatal(err)
	}
	if oversized || string(exact) != "hello" {
		t.Fatalf("exactly at limit: oversized=%v body=%q, want complete body", oversized, exact)
	}
}

// knowledgeDownloadContentType. An extension MIME lookup is environment
// dependent (Go consults the platform's mime.types), so only the fallback is
// pinned — that is the branch this function owns.
func TestKnowledgeDownloadContentTypeFallsBackToOctetStream(t *testing.T) {
	if got := knowledgeDownloadContentType("docs/no-extension-here"); got != "application/octet-stream" {
		t.Fatalf("extensionless path: got %q, want application/octet-stream", got)
	}
}

// The download endpoint is the only way to get a binary or oversized file out
// of the knowledge base intact, so its contract runs against a real workspace
// row with a tagged knowledge repo — the same shape loadKnowledgeRepo resolves.
func TestGetKnowledgeDownloadServesWholeFileAsAttachment(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("requires DB")
	}

	body := strings.Repeat("贝", 300)
	stubKnowledgeClients(t, &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(req.URL.Path, "/contents/docs/guide.md") {
			return jsonResponse(http.StatusNotFound, `{"message":"nope"}`), nil
		}
		return textResponse(http.StatusOK, body), nil
	})})

	workspaceID := dbfx.Workspace(t,
		"Knowledge download "+t.Name(),
		"kb-download-"+strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-")),
		testutil.Cols{
			"repos": testutil.Raw(`'[{"url":"https://github.com/acme/kb.git","description":"知识库"}]'::jsonb`),
		},
	)

	req := newRequest("GET", "/api/workspaces/"+workspaceID+"/knowledge/download?path=docs/guide.md&ref=main", nil)
	req = withURLParam(req, "id", workspaceID)
	resp := testutil.Call(t, testHandler.GetKnowledgeDownload, req).Want(http.StatusOK)

	disposition := resp.Header().Get("Content-Disposition")
	if !strings.HasPrefix(disposition, "attachment;") || !strings.Contains(disposition, "guide.md") {
		t.Fatalf("Content-Disposition = %q, want an attachment carrying guide.md", disposition)
	}
	if got := resp.Body.String(); got != body {
		t.Fatalf("body len=%d, want the whole %d byte file", len(got), len(body))
	}
}

// The path guard is shared with the preview endpoint, but the download endpoint
// is the one that would hand raw bytes to a traversal, so it is asserted here
// rather than assumed from the preview's coverage.
func TestGetKnowledgeDownloadRejectsUnsafePaths(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("requires DB")
	}

	workspaceID := dbfx.Workspace(t,
		"Knowledge download guard "+t.Name(),
		"kb-download-guard-"+strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-")),
		testutil.Cols{
			"repos": testutil.Raw(`'[{"url":"https://github.com/acme/kb.git","description":"知识库"}]'::jsonb`),
		},
	)

	for _, tc := range []struct {
		name  string
		query string
	}{
		{name: "missing path", query: "?ref=main"},
		{name: "parent traversal", query: "?path=" + url.QueryEscape("../../etc/passwd") + "&ref=main"},
		{name: "absolute path", query: "?path=" + url.QueryEscape("/etc/passwd") + "&ref=main"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := newRequest("GET", "/api/workspaces/"+workspaceID+"/knowledge/download"+tc.query, nil)
			req = withURLParam(req, "id", workspaceID)
			testutil.Call(t, testHandler.GetKnowledgeDownload, req).Want(http.StatusBadRequest)
		})
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func jsonResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func textResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"text/plain"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}
