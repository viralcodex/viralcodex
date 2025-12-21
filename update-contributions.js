import fs from "fs";
import fetch from 'node-fetch';

const USERNAME = "viralcodex";
const README_PATH = "./README.md";
const PR_SECTION_START = "<!--START_SECTION:external_prs-->";
const PR_SECTION_END = "<!--END_SECTION:external_prs-->";
const MAX_PRS = 15; // Number of latest PRs to show

async function fetchPullRequests() {
  let results = [];
  let page = 1;
  const per_page = 50;

  while (true) {
    const response = await fetch(
      `https://api.github.com/search/issues?q=type:pr+author:${USERNAME}+is:public&per_page=${per_page}&page=${page}`,
      {
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": USERNAME,
        },
      }
    );

    if (!response.ok) {
      console.error("Failed to fetch PRs:", response.statusText);
      break;
    }

    const data = await response.json();
    const prs = data.items || [];

    // Filter PRs to exclude ones from your own repos
    const filtered = prs.filter(
      (pr) => !pr.repository_url.includes(`/${USERNAME}/`)
    );

    results = results.concat(filtered);

    if (prs.length < per_page) break;
    page++;
  }

  //sort based on status, merged go first then open then closed
  results.sort((a, b) => {
    const getPriority = (pr) => {
      if(pr.state === 'closed' && pr.pull_request?.merged_at) return 0; //merged
      else if(pr.state === 'open') return 1; //open
      return 2; //closed
    }

    return getPriority(a) - getPriority(b);
  })

  return results.slice(0, MAX_PRS).map((pr) => ({
    title: pr.title,
    url: pr.html_url,
    repo: pr.repository_url.replace("api.github.com/repos", "github.com"),
    state: pr.state,
  })).filter((pr) => !pr.repo.includes("SharedSolutions"));
}

function generateTable(prs) {
  if (!prs.length) return "No recent PRs found.";

  const header = "| Repository | Title | Status |\n|-------------|--------|---------------|";
  const rows = prs
    .map(
      (pr) =>
        `| [${pr.repo.split("/").slice(-1)[0]}](${pr.repo}) | [${pr.title}](${pr.url}) | ${pr.state === "open" ? "`Open`" : "`Merged`"} |`
    ).join("\n");

  return `${header}\n${rows}`;
}

function updateReadme(content, newSection) {
  const start = content.indexOf(PR_SECTION_START);
  const end = content.indexOf(PR_SECTION_END);

  if (start === -1 || end === -1) {
    console.error("PR section markers not found in README.md");
    process.exit(1);
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
  const readme = fs.readFileSync(README_PATH, "utf-8");
  const updated = updateReadme(readme, prTable);
  fs.writeFileSync(README_PATH, updated);
  console.log("✅ Updated README with latest PRs");
}

main();
