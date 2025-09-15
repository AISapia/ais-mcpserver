#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface GitRunnerState {
  isRunning: boolean;
  autoCommit: boolean;
  commitInterval: number; // in minutes
  lastCommit: Date | null;
}

class GitRunnerMCPServer {
  private server: Server;
  private state: GitRunnerState = {
    isRunning: false,
    autoCommit: false,
    commitInterval: 30,
    lastCommit: null,
  };
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "git-runner-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      this.stopGitRunner();
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "start_git_runner",
          description: "Start the Git automation service",
          inputSchema: {
            type: "object",
            properties: {
              autoCommit: {
                type: "boolean",
                description: "Enable automatic commits",
                default: false,
              },
              interval: {
                type: "number",
                description: "Auto-commit interval in minutes",
                default: 30,
              },
            },
          },
        },
        {
          name: "stop_git_runner",
          description: "Stop the Git automation service",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "git_commit_with_ai",
          description: "Create an AI-generated commit message and commit changes",
          inputSchema: {
            type: "object",
            properties: {
              files: {
                type: "array",
                items: { type: "string" },
                description: "Specific files to commit (optional, commits all changes if not provided)",
              },
            },
          },
        },
        {
          name: "git_push",
          description: "Push committed changes to remote repository",
          inputSchema: {
            type: "object",
            properties: {
              force: {
                type: "boolean",
                description: "Force push (use with caution)",
                default: false,
              },
            },
          },
        },
        {
          name: "get_git_status",
          description: "Get current git repository status",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_runner_status",
          description: "Get current Git Runner service status",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ] as Tool[],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case "start_git_runner":
            return await this.startGitRunner(request.params.arguments);
          case "stop_git_runner":
            return await this.stopGitRunner();
          case "git_commit_with_ai":
            return await this.gitCommitWithAI(request.params.arguments);
          case "git_push":
            return await this.gitPush(request.params.arguments);
          case "get_git_status":
            return await this.getGitStatus();
          case "get_runner_status":
            return await this.getRunnerStatus();
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
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

  private async startGitRunner(args: any = {}) {
    if (this.state.isRunning) {
      return {
        content: [
          {
            type: "text",
            text: "Git Runner is already running",
          },
        ],
      };
    }

    this.state.isRunning = true;
    this.state.autoCommit = args.autoCommit || false;
    this.state.commitInterval = args.interval || 30;

    if (this.state.autoCommit) {
      this.intervalId = setInterval(async () => {
        try {
          await this.autoCommitIfChanges();
        } catch (error) {
          console.error("Auto-commit error:", error);
        }
      }, this.state.commitInterval * 60 * 1000);
    }

    return {
      content: [
        {
          type: "text",
          text: `Git Runner started successfully!
Running: ${this.state.isRunning}
Auto-commit: ${this.state.autoCommit}
Interval: ${this.state.commitInterval} minutes`,
        },
      ],
    };
  }

  private async stopGitRunner() {
    if (!this.state.isRunning) {
      return {
        content: [
          {
            type: "text",
            text: "Git Runner is not currently running",
          },
        ],
      };
    }

    this.state.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    return {
      content: [
        {
          type: "text",
          text: "Git Runner stopped successfully",
        },
      ],
    };
  }

  private async generateCommitMessage(changedFiles: string[]): Promise<string> {
    try {
      // Get git diff for context
      const { stdout: diffOutput } = await execAsync("git diff --cached");

      // Analyze the changes and generate a meaningful commit message
      const fileTypes = this.analyzeFileTypes(changedFiles);
      const changeType = this.determineChangeType(diffOutput);

      let message = "";

      if (changeType.includes("add")) {
        message = `feat: add ${this.getFeatureDescription(changedFiles, diffOutput)}`;
      } else if (changeType.includes("fix")) {
        message = `fix: resolve ${this.getFixDescription(changedFiles, diffOutput)}`;
      } else if (changeType.includes("update")) {
        message = `chore: update ${this.getUpdateDescription(changedFiles)}`;
      } else if (changeType.includes("refactor")) {
        message = `refactor: improve ${this.getRefactorDescription(changedFiles)}`;
      } else {
        message = `chore: modify ${changedFiles.length > 1 ? "multiple files" : changedFiles[0]}`;
      }

      return message;
    } catch (error) {
      return `chore: automated commit - ${new Date().toISOString()}`;
    }
  }

  private analyzeFileTypes(files: string[]): { [key: string]: number } {
    const types: { [key: string]: number } = {};
    files.forEach(file => {
      const ext = file.split('.').pop() || 'unknown';
      types[ext] = (types[ext] || 0) + 1;
    });
    return types;
  }

  private determineChangeType(diff: string): string {
    if (diff.includes("new file mode")) return "add";
    if (diff.includes("deleted file mode")) return "delete";
    if (diff.includes("function") || diff.includes("class")) return "refactor";
    if (diff.includes("bug") || diff.includes("error") || diff.includes("fix")) return "fix";
    return "update";
  }

  private getFeatureDescription(files: string[], diff: string): string {
    const fileTypes = this.analyzeFileTypes(files);
    const mainType = Object.keys(fileTypes)[0];
    return `new ${mainType} functionality`;
  }

  private getFixDescription(files: string[], diff: string): string {
    return "issues in codebase";
  }

  private getUpdateDescription(files: string[]): string {
    if (files.some(f => f.includes("package.json"))) return "dependencies";
    if (files.some(f => f.includes("config"))) return "configuration";
    return "project files";
  }

  private getRefactorDescription(files: string[]): string {
    const fileTypes = this.analyzeFileTypes(files);
    const mainType = Object.keys(fileTypes)[0];
    return `${mainType} code structure`;
  }

  private async gitCommitWithAI(args: any = {}) {
    try {
      // Check if there are changes to commit
      const { stdout: statusOutput } = await execAsync("git status --porcelain");
      if (!statusOutput.trim()) {
        return {
          content: [
            {
              type: "text",
              text: "No changes to commit",
            },
          ],
        };
      }

      // Add files to staging
      if (args.files && args.files.length > 0) {
        for (const file of args.files) {
          await execAsync(`git add "${file}"`);
        }
      } else {
        await execAsync("git add .");
      }

      // Get list of staged files
      const { stdout: stagedFiles } = await execAsync("git diff --cached --name-only");
      const changedFiles = stagedFiles.trim().split('\n').filter(f => f);

      // Generate AI commit message
      const commitMessage = await this.generateCommitMessage(changedFiles);

      // Commit with the generated message
      await execAsync(`git commit -m "${commitMessage}"`);

      this.state.lastCommit = new Date();

      return {
        content: [
          {
            type: "text",
            text: `Commit successful!
Message: ${commitMessage}
Files: ${changedFiles.join(", ")}
Time: ${this.state.lastCommit.toISOString()}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to commit: ${error}`);
    }
  }

  private async gitPush(args: any = {}) {
    try {
      const pushCommand = args.force ? "git push --force" : "git push";
      const { stdout: pushOutput } = await execAsync(pushCommand);

      return {
        content: [
          {
            type: "text",
            text: `Push successful!
Output: ${pushOutput}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to push: ${error}`);
    }
  }

  private async getGitStatus() {
    try {
      const { stdout: statusOutput } = await execAsync("git status --porcelain");
      const { stdout: branchOutput } = await execAsync("git branch --show-current");
      const { stdout: remoteOutput } = await execAsync("git remote get-url origin");

      const files = statusOutput.trim().split('\n').filter(f => f);
      const modifiedFiles = files.filter(f => f.startsWith(' M'));
      const addedFiles = files.filter(f => f.startsWith('A'));
      const untrackedFiles = files.filter(f => f.startsWith('??'));

      return {
        content: [
          {
            type: "text",
            text: `Git Repository Status:
Branch: ${branchOutput.trim()}
Remote: ${remoteOutput.trim()}

Changes:
- Modified: ${modifiedFiles.length} files
- Added: ${addedFiles.length} files
- Untracked: ${untrackedFiles.length} files

Total files with changes: ${files.length}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get git status: ${error}`);
    }
  }

  private async getRunnerStatus() {
    return {
      content: [
        {
          type: "text",
          text: `Git Runner Status:
Running: ${this.state.isRunning}
Auto-commit: ${this.state.autoCommit}
Interval: ${this.state.commitInterval} minutes
Last commit: ${this.state.lastCommit ? this.state.lastCommit.toISOString() : "Never"}

Available commands:
- start_git_runner: Start the automation service
- stop_git_runner: Stop the service
- git_commit_with_ai: Manual commit with AI message
- git_push: Push changes to remote`,
        },
      ],
    };
  }

  private async autoCommitIfChanges() {
    try {
      const { stdout: statusOutput } = await execAsync("git status --porcelain");
      if (statusOutput.trim()) {
        await this.gitCommitWithAI();
        console.log("Auto-commit performed at", new Date().toISOString());
      }
    } catch (error) {
      console.error("Auto-commit failed:", error);
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Git Runner MCP Server running on stdio");
  }
}

const server = new GitRunnerMCPServer();
server.run().catch(console.error);