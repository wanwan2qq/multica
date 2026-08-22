package handler

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
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
