import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.GITHUB_TOKEN;
const LOGIN = process.env.PROFILE_USER || "mPedrosaa";

if (!TOKEN) {
  throw new Error("GITHUB_TOKEN is not set");
}

const query = `
  query($login: String!, $prQuery: String!, $issueQuery: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
        }
      }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
        totalCount
        nodes {
          stargazerCount
          languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
        }
      }
    }
    prs: search(query: $prQuery, type: ISSUE, first: 1) {
      issueCount
    }
    issues: search(query: $issueQuery, type: ISSUE, first: 1) {
      issueCount
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "mPedrosaa-profile-stats",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: LOGIN,
      prQuery: `author:${LOGIN} is:pr`,
      issueQuery: `author:${LOGIN} is:issue`,
    },
  }),
});

const payload = await response.json();

if (!response.ok || payload.errors) {
  throw new Error(JSON.stringify(payload.errors ?? payload, null, 2));
}

const user = payload.data.user;
const repos = user.repositories.nodes;
const contributions =
  user.contributionsCollection.contributionCalendar.totalContributions;
const pullRequests = payload.data.prs.issueCount;
const issues = payload.data.issues.issueCount;
const repositoryCount = user.repositories.totalCount;
const stars = repos.reduce((total, repo) => total + repo.stargazerCount, 0);

const languages = new Map();

for (const repo of repos) {
  for (const edge of repo.languages.edges) {
    const current = languages.get(edge.node.name) ?? {
      name: edge.node.name,
      color: edge.node.color || "#8b949e",
      size: 0,
    };
    current.size += edge.size;
    languages.set(edge.node.name, current);
  }
}

const sortedLanguages = [...languages.values()].sort((a, b) => b.size - a.size);
const totalLanguageSize = sortedLanguages.reduce(
  (total, language) => total + language.size,
  0,
);

const topLanguages = sortedLanguages.slice(0, 4);
const otherSize = sortedLanguages
  .slice(4)
  .reduce((total, language) => total + language.size, 0);

if (otherSize > 0) {
  topLanguages.push({ name: "Other", color: "#8b949e", size: otherSize });
}

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const number = new Intl.NumberFormat("en-US").format;

const cardStart = (label) => `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200" viewBox="0 0 340 200" role="img" aria-label="${escapeXml(label)}">
  <style>
    text {
      font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', sans-serif;
      font-variant-numeric: tabular-nums;
    }
  </style>
  <rect x="0.5" y="0.5" width="339" height="199" rx="6" fill="#00000000" stroke="#d0d7de" stroke-opacity="0.5" />
`;

const statsRows = [
  ["Contributions (1y)", contributions],
  ["Pull requests", pullRequests],
  ["Issues", issues],
  ["Repositories", repositoryCount],
  ["Stars", stars],
];

const statsSvg = `${cardStart("GitHub stats")}
  <text x="30" y="40" fill="#006AFF" font-size="22" font-weight="600">Stats</text>
${statsRows
  .map(
    ([label, value], index) => `  <text x="30" y="${70 + index * 25}" fill="#417E87" font-size="14">${escapeXml(label)}</text>
  <text x="310" y="${70 + index * 25}" text-anchor="end" fill="#417E87" font-size="14" font-weight="600">${number(value)}</text>`,
  )
  .join("\n")}
</svg>
`;

const languageRows = topLanguages
  .map((language, index) => {
    const percentage = (language.size / totalLanguageSize) * 100;
    const barWidth = Math.max(2, (percentage / 100) * 260);
    const y = 70 + index * 25;

    return `  <circle cx="36" cy="${y - 5}" r="5" fill="${escapeXml(language.color)}" />
  <text x="50" y="${y}" fill="#417E87" font-size="14">${escapeXml(language.name)}</text>
  <text x="310" y="${y}" text-anchor="end" fill="#417E87" font-size="14">${percentage.toFixed(1)}%</text>
  <rect x="50" y="${y + 5}" width="260" height="4" rx="2" fill="#d0d7de" fill-opacity="0.35" />
  <rect x="50" y="${y + 5}" width="${barWidth}" height="4" rx="2" fill="${escapeXml(language.color)}" />`;
  })
  .join("\n");

const languagesSvg = `${cardStart("Top languages")}
  <text x="30" y="40" fill="#006AFF" font-size="22" font-weight="600">Languages</text>
${languageRows}
</svg>
`;

const outputDir = path.join(process.cwd(), "assets");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "stats.svg"), statsSvg);
fs.writeFileSync(path.join(outputDir, "languages.svg"), languagesSvg);

console.log(`Generated stats for ${LOGIN}: ${pullRequests} PRs, ${issues} issues, ${topLanguages.length} languages`);
