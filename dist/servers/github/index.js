#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
class GitHubMCPServer {
    server;
    constructor() {
        this.server = new Server({
            name: "github-mcp",
            version: "1.0.0",
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    setupErrorHandling() {
        this.server.onerror = (error) => console.error("[MCP Error]", error);
        process.on("SIGINT", async () => {
            await this.server.close();
            process.exit(0);
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "list_issues",
                    description: "List GitHub issues for the current repository",
                    inputSchema: {
                        type: "object",
                        properties: {
                            state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
                            limit: { type: "number", default: 10 },
                            assignee: { type: "string", description: "Filter by assignee" },
                            label: { type: "string", description: "Filter by label" },
                        },
                    },
                },
                {
                    name: "create_issue",
                    description: "Create a new GitHub issue",
                    inputSchema: {
                        type: "object",
                        properties: {
                            title: { type: "string", description: "Issue title" },
                            body: { type: "string", description: "Issue description" },
                            assignees: { type: "array", items: { type: "string" }, description: "Issue assignees" },
                            labels: { type: "array", items: { type: "string" }, description: "Issue labels" },
                        },
                        required: ["title"],
                    },
                },
                {
                    name: "update_issue",
                    description: "Update an existing GitHub issue",
                    inputSchema: {
                        type: "object",
                        properties: {
                            number: { type: "number", description: "Issue number" },
                            title: { type: "string", description: "New title" },
                            body: { type: "string", description: "New body" },
                            state: { type: "string", enum: ["open", "closed"] },
                            assignees: { type: "array", items: { type: "string" } },
                            labels: { type: "array", items: { type: "string" } },
                        },
                        required: ["number"],
                    },
                },
                {
                    name: "list_pull_requests",
                    description: "List GitHub pull requests for the current repository",
                    inputSchema: {
                        type: "object",
                        properties: {
                            state: { type: "string", enum: ["open", "closed", "merged", "all"], default: "open" },
                            limit: { type: "number", default: 10 },
                            base: { type: "string", description: "Filter by base branch" },
                            head: { type: "string", description: "Filter by head branch" },
                        },
                    },
                },
                {
                    name: "create_pull_request",
                    description: "Create a new GitHub pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            title: { type: "string", description: "PR title" },
                            body: { type: "string", description: "PR description" },
                            head: { type: "string", description: "Head branch" },
                            base: { type: "string", description: "Base branch", default: "main" },
                            draft: { type: "boolean", description: "Create as draft", default: false },
                        },
                        required: ["title", "head"],
                    },
                },
                {
                    name: "get_repository_info",
                    description: "Get information about the current repository",
                    inputSchema: {
                        type: "object",
                        properties: {},
                    },
                },
                {
                    name: "list_branches",
                    description: "List repository branches",
                    inputSchema: {
                        type: "object",
                        properties: {
                            remote: { type: "boolean", description: "Include remote branches", default: false },
                        },
                    },
                },
                {
                    name: "create_branch",
                    description: "Create a new branch",
                    inputSchema: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Branch name" },
                            source: { type: "string", description: "Source branch", default: "main" },
                        },
                        required: ["name"],
                    },
                },
                {
                    name: "search_code",
                    description: "Search for code in the repository",
                    inputSchema: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Search query" },
                            language: { type: "string", description: "Programming language filter" },
                            filename: { type: "string", description: "Filename filter" },
                        },
                        required: ["query"],
                    },
                },
                {
                    name: "get_release_info",
                    description: "Get information about repository releases",
                    inputSchema: {
                        type: "object",
                        properties: {
                            limit: { type: "number", default: 5 },
                        },
                    },
                },
            ],
        }));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                switch (request.params.name) {
                    case "list_issues":
                        return await this.listIssues(request.params.arguments);
                    case "create_issue":
                        return await this.createIssue(request.params.arguments);
                    case "update_issue":
                        return await this.updateIssue(request.params.arguments);
                    case "list_pull_requests":
                        return await this.listPullRequests(request.params.arguments);
                    case "create_pull_request":
                        return await this.createPullRequest(request.params.arguments);
                    case "get_repository_info":
                        return await this.getRepositoryInfo();
                    case "list_branches":
                        return await this.listBranches(request.params.arguments);
                    case "create_branch":
                        return await this.createBranch(request.params.arguments);
                    case "search_code":
                        return await this.searchCode(request.params.arguments);
                    case "get_release_info":
                        return await this.getReleaseInfo(request.params.arguments);
                    default:
                        throw new Error(`Unknown tool: ${request.params.name}`);
                }
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                };
            }
        });
    }
    async listIssues(args = {}) {
        const { state = "open", limit = 10, assignee, label } = args;
        let command = `gh issue list --state ${state} --limit ${limit} --json number,title,body,state,author,labels,assignees,createdAt,updatedAt`;
        if (assignee) {
            command += ` --assignee ${assignee}`;
        }
        if (label) {
            command += ` --label "${label}"`;
        }
        const { stdout } = await execAsync(command);
        const issues = JSON.parse(stdout);
        if (issues.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No issues found with the specified criteria.`,
                    },
                ],
            };
        }
        const issueList = issues.map(issue => `#${issue.number}: ${issue.title}
  State: ${issue.state}
  Author: ${issue.author}
  Labels: ${issue.labels?.join(", ") || "None"}
  Assignees: ${issue.assignees?.join(", ") || "None"}
  Created: ${new Date(issue.createdAt).toLocaleDateString()}
  ${issue.body ? `\n  ${issue.body.substring(0, 200)}${issue.body.length > 200 ? "..." : ""}` : ""}
`).join("\n---\n");
        return {
            content: [
                {
                    type: "text",
                    text: `Found ${issues.length} issues:

${issueList}`,
                },
            ],
        };
    }
    async createIssue(args) {
        const { title, body = "", assignees = [], labels = [] } = args;
        let command = `gh issue create --title "${title}" --body "${body}"`;
        if (assignees.length > 0) {
            command += ` --assignee ${assignees.join(",")}`;
        }
        if (labels.length > 0) {
            command += ` --label ${labels.join(",")}`;
        }
        const { stdout } = await execAsync(command);
        return {
            content: [
                {
                    type: "text",
                    text: `Issue created successfully!
${stdout}

Title: ${title}
Assignees: ${assignees.join(", ") || "None"}
Labels: ${labels.join(", ") || "None"}`,
                },
            ],
        };
    }
    async updateIssue(args) {
        const { number, title, body, state, assignees, labels } = args;
        let command = `gh issue edit ${number}`;
        if (title)
            command += ` --title "${title}"`;
        if (body)
            command += ` --body "${body}"`;
        if (assignees)
            command += ` --add-assignee ${assignees.join(",")}`;
        if (labels)
            command += ` --add-label ${labels.join(",")}`;
        await execAsync(command);
        if (state) {
            const stateCommand = state === "closed" ? `gh issue close ${number}` : `gh issue reopen ${number}`;
            await execAsync(stateCommand);
        }
        return {
            content: [
                {
                    type: "text",
                    text: `Issue #${number} updated successfully!`,
                },
            ],
        };
    }
    async listPullRequests(args = {}) {
        const { state = "open", limit = 10, base, head } = args;
        let command = `gh pr list --state ${state} --limit ${limit} --json number,title,body,state,author,baseRefName,headRefName,createdAt,updatedAt`;
        if (base) {
            command += ` --base ${base}`;
        }
        if (head) {
            command += ` --head ${head}`;
        }
        const { stdout } = await execAsync(command);
        const prs = JSON.parse(stdout);
        if (prs.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No pull requests found with the specified criteria.`,
                    },
                ],
            };
        }
        const prList = prs.map(pr => `#${pr.number}: ${pr.title}
  State: ${pr.state}
  Author: ${pr.author}
  Branch: ${pr.headBranch} → ${pr.baseBranch}
  Created: ${new Date(pr.createdAt).toLocaleDateString()}
  ${pr.body ? `\n  ${pr.body.substring(0, 200)}${pr.body.length > 200 ? "..." : ""}` : ""}
`).join("\n---\n");
        return {
            content: [
                {
                    type: "text",
                    text: `Found ${prs.length} pull requests:

${prList}`,
                },
            ],
        };
    }
    async createPullRequest(args) {
        const { title, body = "", head, base = "main", draft = false } = args;
        let command = `gh pr create --title "${title}" --body "${body}" --head ${head} --base ${base}`;
        if (draft) {
            command += " --draft";
        }
        const { stdout } = await execAsync(command);
        return {
            content: [
                {
                    type: "text",
                    text: `Pull request created successfully!
${stdout}

Title: ${title}
Branch: ${head} → ${base}
Draft: ${draft}`,
                },
            ],
        };
    }
    async getRepositoryInfo() {
        const { stdout } = await execAsync("gh repo view --json name,description,owner,url,defaultBranch,visibility,createdAt,pushedAt,issues,pullRequests,stargazers,forks");
        const repoInfo = JSON.parse(stdout);
        return {
            content: [
                {
                    type: "text",
                    text: `Repository Information:

Name: ${repoInfo.name}
Owner: ${repoInfo.owner.login}
Description: ${repoInfo.description || "No description"}
URL: ${repoInfo.url}
Default Branch: ${repoInfo.defaultBranch}
Visibility: ${repoInfo.visibility}
Created: ${new Date(repoInfo.createdAt).toLocaleDateString()}
Last Push: ${new Date(repoInfo.pushedAt).toLocaleDateString()}

Statistics:
- Stars: ${repoInfo.stargazers.totalCount}
- Forks: ${repoInfo.forks.totalCount}
- Open Issues: ${repoInfo.issues.totalCount}
- Open Pull Requests: ${repoInfo.pullRequests.totalCount}`,
                },
            ],
        };
    }
    async listBranches(args = {}) {
        const { remote = false } = args;
        const command = remote ? "git branch -a" : "git branch";
        const { stdout } = await execAsync(command);
        const branches = stdout.split('\n')
            .filter(branch => branch.trim())
            .map(branch => branch.replace(/^\*?\s*/, '').trim())
            .filter(branch => branch);
        return {
            content: [
                {
                    type: "text",
                    text: `Branches${remote ? " (including remote)" : ""}:

${branches.join("\n")}

Total: ${branches.length} branches`,
                },
            ],
        };
    }
    async createBranch(args) {
        const { name, source = "main" } = args;
        await execAsync(`git checkout -b ${name} ${source}`);
        return {
            content: [
                {
                    type: "text",
                    text: `Branch '${name}' created successfully from '${source}' and checked out.`,
                },
            ],
        };
    }
    async searchCode(args) {
        const { query, language, filename } = args;
        let command = `gh search code "${query}"`;
        if (language) {
            command += ` --language ${language}`;
        }
        if (filename) {
            command += ` --filename ${filename}`;
        }
        command += " --json repository,path,url --limit 10";
        const { stdout } = await execAsync(command);
        const results = JSON.parse(stdout);
        if (results.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No code found for query: "${query}"`,
                    },
                ],
            };
        }
        const resultList = results.map((result, index) => `${index + 1}. ${result.path}
   Repository: ${result.repository.fullName}
   URL: ${result.url}
`).join("\n");
        return {
            content: [
                {
                    type: "text",
                    text: `Found ${results.length} code results for "${query}":

${resultList}`,
                },
            ],
        };
    }
    async getReleaseInfo(args = {}) {
        const { limit = 5 } = args;
        const { stdout } = await execAsync(`gh release list --limit ${limit} --json tagName,name,body,createdAt,url`);
        const releases = JSON.parse(stdout);
        if (releases.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No releases found for this repository.",
                    },
                ],
            };
        }
        const releaseList = releases.map((release) => `${release.tagName}: ${release.name || "No title"}
  Created: ${new Date(release.createdAt).toLocaleDateString()}
  URL: ${release.url}
  ${release.body ? `\n  ${release.body.substring(0, 200)}${release.body.length > 200 ? "..." : ""}` : ""}
`).join("\n---\n");
        return {
            content: [
                {
                    type: "text",
                    text: `Latest ${releases.length} releases:

${releaseList}`,
                },
            ],
        };
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("GitHub MCP Server running on stdio");
    }
}
const server = new GitHubMCPServer();
server.run().catch(console.error);
//# sourceMappingURL=index.js.map