import fs from "fs/promises";
import fetch from "node-fetch";

const USERNAME = process.env.GITHUB_USERNAME || "viralcodex";
const README_PATH = process.env.README_PATH || "./README.md";
const MAX_PRS = Number(process.env.MAX_PRS || 15);

const PR_SECTION_START = "<!--START_SECTION:external_prs-->";
const PR_SECTION_END = "<!--END_SECTION:external_prs-->";

async function fetchPullRequests() {
  const results = [];
  let page = 1;
  const perPage = 50;

  while (results.length < MAX_PRS) {
    const res = await fetch(
      `https://api.github.com/search/issues?q=type:pr+author:${USERNAME}+is:public&per_page=${perPage}&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": USERNAME,
        },
      }
    );

    if (!res.ok) {
      throw new Error(`GitHub API failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.items || data.items.length === 0) break;

    for (const pr of data.items) {
      const repoUrl = pr.repository_url.replace(
        "api.github.com/repos",
        "github.com"
      );
      const repoName = repoUrl.split("/").pop();

      if (repoUrl.includes(`/${USERNAME}/`)) continue;
      if (["SharedSolutions", "My-Portfolio"].includes(repoName)) continue;

      results.push({
        title: pr.title,
        url: pr.html_url,
        repo: repoUrl,
        repoName,
        state: pr.state, // open | closed
        updatedAt: pr.updated_at,
      });

      if (results.length >= MAX_PRS) break;
    }

    page++;
  }

  // Honest sorting: open first, then closed, then by recent activity
  results.sort((a, b) => {
    if (a.state !== b.state) {
      return a.state === "open" ? -1 : 1;
    }
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  return results.slice(0, MAX_PRS);
}

function generateTable(prs) {
  if (prs.length === 0) {
    return "No recent PRs found.";
  }

  const header =
    "| Repository | Title | Status |\n|------------|-------|--------|";

  const rows = prs
    .map(
      (pr) =>
        `| [${pr.repoName}](${pr.repo}) | [${pr.title}](${pr.url}) | \`${pr.state}\` |`
    )
    .join("\n");

  return `${header}\n${rows}`;
}

function updateReadme(content, newSection) {
  const start = content.indexOf(PR_SECTION_START);
  const end = content.indexOf(PR_SECTION_END);

  if (start === -1 || end === -1 || start > end) {
    throw new Error("PR section markers not found or malformed");
  }

  return (
    content.slice(0, start + PR_SECTION_START.length) +
    "\n\n" +
    newSection +
    "\n\n" +
    content.slice(end)
  );
}

async function main() {
  const prs = await fetchPullRequests();
  const prTable = generateTable(prs);
  const readme = await fs.readFile(README_PATH, "utf8");
  const updated = updateReadme(readme, prTable);
  await fs.writeFile(README_PATH, updated);
  console.log("Updated README with latest external PRs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
