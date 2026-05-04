import fs from "fs/promises";
import fetch from "node-fetch";

const USERNAME = "viralcodex";
const README_PATH = "./README.md";
const MAX_PRS = 15;

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
      `https://api.github.com/search/issues?q=type:pr+author:${USERNAME}+is:public+is:merged&sort=updated&order=desc&per_page=${perPage}&page=${page}`,
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
      if (!details.merged_at) continue;

      collected.push({
        title: pr.title,
        url: pr.html_url,
        repo: repoUrl,
        repoName,
        mergedAt: details.merged_at,
        updatedAt: pr.updated_at,
      });

      if (collected.length >= MAX_PRS) break;
    }

    page++;
  }

  collected.sort((a, b) => new Date(b.mergedAt) - new Date(a.mergedAt));

  return collected.slice(0, MAX_PRS);
}

function formatTimelineLabel(pr) {
  const prNumber = pr.url.match(/\/pull\/(\d+)/)?.[1] ?? "?";
  const compactRepoName =
    pr.repoName.length > 14 ? `${pr.repoName.slice(0, 11)}...` : pr.repoName;

  return `${compactRepoName}#${prNumber}`;
}

function formatMergedDate(pr) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(new Date(pr.mergedAt));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderCell(content) {
  return `    <td align="center">${content}</td>`;
}

function buildLinkedTimeline(prs) {
  const topRow = [];
  const axisRow = [];
  const bottomRow = [];

  prs.forEach((pr, index) => {
    const label = escapeHtml(formatTimelineLabel(pr));
    const mergedDate = escapeHtml(formatMergedDate(pr));
    const href = escapeHtml(pr.url);
    const linkedLabel = `<a href="${href}">${label}</a>`;

    if (index % 2 === 0) {
      topRow.push(renderCell(`<sub>${mergedDate}</sub><br>${linkedLabel}`));
      bottomRow.push(renderCell("&nbsp;"));
    } else {
      topRow.push(renderCell("&nbsp;"));
      bottomRow.push(renderCell(`${linkedLabel}<br><sub>${mergedDate}</sub>`));
    }

    axisRow.push(renderCell("<code>------|------</code>"));

    if (index < prs.length - 1) {
      topRow.push(renderCell("&nbsp;"));
      axisRow.push(renderCell("<code>--------------</code>"));
      bottomRow.push(renderCell("&nbsp;"));
    }
  });

  return [
    "<table>",
    "  <tr>",
    ...topRow,
    "  </tr>",
    "  <tr>",
    ...axisRow,
    "  </tr>",
    "  <tr>",
    ...bottomRow,
    "  </tr>",
    "</table>",
  ].join("\n");
}

function generateTimelineMarkdown(prs) {
  if (prs.length === 0) {
    return "No recent merged external PRs found.";
  }

  const timelinePrs = [...prs].sort(
    (a, b) => new Date(a.mergedAt) - new Date(b.mergedAt)
  );

  return [
    "Scroll horizontally to read the merged PR timeline from left to right.",
    "",
    buildLinkedTimeline(timelinePrs),
  ].join("\n");
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
  const section = generateTimelineMarkdown(prs);

  const readme = await fs.readFile(README_PATH, "utf8");
  const updated = updateReadme(readme, section);

  await fs.writeFile(README_PATH, updated);
  console.log("README updated with merged PR timeline");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
