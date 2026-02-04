import fs from "fs/promises";
import fetch from "node-fetch";

const USERNAME = process.env.GITHUB_USERNAME || "viralcodex";
const README_PATH = process.env.README_PATH || "./README.md";
const MAX_PRS = Number(process.env.MAX_PRS || 15);

const PR_SECTION_START = "<!--START_SECTION:external_prs-->";
const PR_SECTION_END = "<!--END_SECTION:external_prs-->";

const EXCLUDED_REPOS = new Set(["SharedSolutions", "My-Portfolio"]);

async function fetchPRDetails(pr) {
  const prUrl = pr.pull_request?.url;
  if (!prUrl) return null;

  const res = await fetch(prUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": USERNAME,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch PR details: ${res.status}`);
  }

  return res.json();
}

async function fetchPullRequests() {
  const collected = [];
  let page = 1;
  const perPage = 50;

  while (collected.length < MAX_PRS) {
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
      throw new Error(`GitHub Search API failed: ${res.status}`);
    }

    const data = await res.json();
    if (!data.items || data.items.length === 0) break;

    for (const pr of data.items) {
      const repoUrl = pr.repository_url.replace(
        "api.github.com/repos",
        "github.com"
      );

      if (repoUrl.includes(`/${USERNAME}/`)) continue;

      const repoName = repoUrl.split("/").pop();
      if (EXCLUDED_REPOS.has(repoName)) continue;

      const details = await fetchPRDetails(pr);
      if (!details) continue;

      let status;
      if (details.merged_at) {
        status = "Merged";
      } else if (details.state === "closed") {
        status = "Closed";
      } else {
        status = "Open";
      }

      collected.push({
        title: pr.title,
        url: pr.html_url,
        repo: repoUrl,
        repoName,
        status,
        updatedAt: pr.updated_at,
      });

      if (collected.length >= MAX_PRS) break;
    }

    page++;
  }

  // Sort: merged → open → closed, then recent first
  const priority = { Merged: 0, Open: 1, Closed: 2 };

  collected.sort((a, b) => {
    if (priority[a.status] !== priority[b.status]) {
      return priority[a.status] - priority[b.status];
    }
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  return collected.slice(0, MAX_PRS);
}

function generateTable(prs) {
  if (prs.length === 0) {
    return "No recent external PRs found.";
  }

  const header =
    "| Repository | Title | Status |\n|------------|-------|--------|";

  const rows = prs
    .map(
      (pr) =>
        `| [${pr.repoName}](${pr.repo}) | [${pr.title}](${pr.url}) | \`${pr.status}\` |`
    )
    .join("\n");

  return `${header}\n${rows}`;
}

function updateReadme(content, section) {
  const start = content.indexOf(PR_SECTION_START);
  const end = content.indexOf(PR_SECTION_END);

  if (start === -1 || end === -1 || start > end) {
    throw new Error("PR section markers missing or malformed in README");
  }

  return (
    content.slice(0, start + PR_SECTION_START.length) +
    "\n\n" +
    section +
    "\n\n" +
    content.slice(end)
  );
}

async function main() {
  const prs = await fetchPullRequests();
  const table = generateTable(prs);

  const readme = await fs.readFile(README_PATH, "utf8");
  const updated = updateReadme(readme, table);

  await fs.writeFile(README_PATH, updated);
  console.log("README updated with merged/open/closed PRs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
