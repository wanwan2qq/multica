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

	ssh, err := parseGitRemote("git@git.example.com:team/docs.git")
	if err != nil {
		t.Fatal(err)
	}
	if ssh.Provider != "gitea" || ssh.Host != "git.example.com" || ssh.Owner != "team" || ssh.Repo != "docs" {
		t.Fatalf("ssh parse: %+v", ssh)
	}
}

func TestClassifyKnowledgeMedia(t *testing.T) {
	if got := classifyKnowledgeMedia("a.md", []byte("# hi")); got != "markdown" {
		t.Fatalf("md: %s", got)
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
	ref, entries, err := fetchKnowledgeTreeHTTP(context.Background(), remote)
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
