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

class InfoMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "info-mcp",
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
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_system_info",
          description: "Get general system and tool information",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "check_gh_status",
          description: "Check GitHub CLI installation and authentication status",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "check_available_agents",
          description: "Check available AI agents and models",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_environment_info",
          description: "Get information about the current environment",
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
          case "get_system_info":
            return await this.getSystemInfo();
          case "check_gh_status":
            return await this.checkGHStatus();
          case "check_available_agents":
            return await this.checkAvailableAgents();
          case "get_environment_info":
            return await this.getEnvironmentInfo();
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

  private async getSystemInfo() {
    try {
      const info = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      };

      return {
        content: [
          {
            type: "text",
            text: `System Information:
Platform: ${info.platform}
Architecture: ${info.arch}
Node.js Version: ${info.nodeVersion}
Timestamp: ${info.timestamp}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get system info: ${error}`);
    }
  }

  private async checkGHStatus() {
    try {
      // Check if gh is installed
      const { stdout: versionOutput } = await execAsync("gh --version");

      // Check authentication status
      let authStatus = "Not authenticated";
      try {
        const { stdout: authOutput } = await execAsync("gh auth status");
        authStatus = "Authenticated";
      } catch (authError) {
        authStatus = "Not authenticated or expired";
      }

      return {
        content: [
          {
            type: "text",
            text: `GitHub CLI Status:
Installation: ✓ Installed
${versionOutput.trim()}
Authentication: ${authStatus}

Available commands:
- gh repo: Repository operations
- gh issue: Issue management
- gh pr: Pull request operations
- gh auth: Authentication management
- gh api: Direct API access`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `GitHub CLI Status:
Installation: ✗ Not installed or not in PATH
Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  private async checkAvailableAgents() {
    const agents = [
      {
        name: "Claude Code",
        description: "Advanced AI assistant for development tasks",
        status: "Available (Current)",
        capabilities: ["Code generation", "Analysis", "Debugging", "MCP integration"]
      },
      {
        name: "Qwen-Coder",
        description: "AI coding assistant optimized for development",
        status: "Available for agentic use",
        capabilities: ["Code completion", "Bug fixes", "Refactoring"]
      },
      {
        name: "Gemini",
        description: "Google's multimodal AI assistant",
        status: "Available",
        capabilities: ["General assistance", "Code analysis", "Documentation"]
      }
    ];

    const agentInfo = agents.map(agent =>
      `${agent.name}:
  Status: ${agent.status}
  Description: ${agent.description}
  Capabilities: ${agent.capabilities.join(", ")}`
    ).join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Available AI Agents:

${agentInfo}

Usage Notes:
- Claude Code: Currently active for this session
- Qwen-Coder: Can be used for specialized coding tasks
- Gemini: General-purpose AI assistant
- All agents support MCP integration for extended capabilities`,
        },
      ],
    };
  }

  private async getEnvironmentInfo() {
    try {
      const cwd = process.cwd();
      let gitInfo = "Not a git repository";

      try {
        const { stdout: gitStatus } = await execAsync("git status --porcelain");
        const { stdout: gitBranch } = await execAsync("git branch --show-current");
        const { stdout: gitRemote } = await execAsync("git remote get-url origin");

        gitInfo = `Git Repository:
  Branch: ${gitBranch.trim()}
  Remote: ${gitRemote.trim()}
  Status: ${gitStatus.trim() ? "Modified files present" : "Clean working tree"}`;
      } catch (gitError) {
        // Not a git repo or git not available
      }

      // Check for common development files
      const commonFiles = ['package.json', 'tsconfig.json', 'Cargo.toml', 'go.mod', 'requirements.txt'];
      const existingFiles: string[] = [];

      for (const file of commonFiles) {
        try {
          await execAsync(`test -f ${file}`);
          existingFiles.push(file);
        } catch {
          // File doesn't exist
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Environment Information:

Current Directory: ${cwd}

${gitInfo}

Project Files Detected: ${existingFiles.length > 0 ? existingFiles.join(", ") : "None"}

Environment Variables:
- HOME: ${process.env.HOME || "Not set"}
- PATH: ${process.env.PATH ? "Set" : "Not set"}
- NODE_ENV: ${process.env.NODE_ENV || "Not set"}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get environment info: ${error}`);
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("INFO MCP Server running on stdio");
  }
}

const server = new InfoMCPServer();
server.run().catch(console.error);