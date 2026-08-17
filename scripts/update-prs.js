// Fetches every merged Pull Request authored by GITHUB_USERNAME across ALL public
// repos (yours + orgs you've contributed to) and rewrites the block between
// <!--START_SECTION:pr--> and <!--END_SECTION:pr--> in README.md with a live table.
//
// Runs inside GitHub Actions (.github/workflows/update-prs.yml) using the
// built-in GITHUB_TOKEN, so no secrets need to be added manually.

const fs = require("fs");

const USERNAME = process.env.GITHUB_USERNAME || "amankv1234";
const TOKEN = process.env.GITHUB_TOKEN;
const README_PATH = "README.md";
const MAX_PRS = 15;

const START_MARKER = "<!--START_SECTION:pr-->";
const END_MARKER = "<!--END_SECTION:pr-->";

async function fetchMergedPRs() {
  const query = encodeURIComponent(`author:${USERNAME} type:pr is:merged`);
  const url = `https://api.github.com/search/issues?q=${query}&sort=updated&order=desc&per_page=${MAX_PRS}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.items || [];
}

function repoFromUrl(repoUrl) {
  // repository_url looks like: https://api.github.com/repos/OWNER/REPO
  const parts = repoUrl.split("/");
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function buildTable(prs) {
  if (prs.length === 0) {
    return "_No merged pull requests found yet — check back soon!_";
  }

  const rows = prs.map((pr) => {
    const repo = repoFromUrl(pr.repository_url);
    const mergedDate = pr.closed_at ? pr.closed_at.split("T")[0] : "";
    const title = pr.title.replace(/\|/g, "\\|");
    return `| [\`${repo}\`](https://github.com/${repo}) | [${title}](${pr.html_url}) | ${mergedDate} |`;
  });

  return [
    "| Repository | Title | Merged On |",
    "|:---|:---|:---:|",
    ...rows,
  ].join("\n");
}

async function main() {
  const prs = await fetchMergedPRs();
  const table = buildTable(prs);

  const readme = fs.readFileSync(README_PATH, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error("Markers not found in README.md — nothing updated.");
    process.exit(1);
  }

  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);

  const updated = `${before}\n\n${table}\n\n${after}`;
  fs.writeFileSync(README_PATH, updated, "utf8");

  console.log(`Updated README with ${prs.length} merged PR(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});