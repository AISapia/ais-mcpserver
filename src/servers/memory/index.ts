#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

interface MemoryEntry {
  id: string;
  project: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
  timestamp: string;
  context: {
    language?: string;
    framework?: string;
    problem?: string;
    solution?: string;
  };
}

interface SearchResult {
  entry: MemoryEntry;
  similarity: number;
  relevantTags: string[];
}

class MemoryMCPServer {
  private server: Server;
  private memoryPath: string;
  private memories: MemoryEntry[] = [];

  constructor() {
    this.memoryPath = "/home/ubuntu/MCP/Memory";
    this.server = new Server(
      {
        name: "memory-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupErrorHandling();
    this.loadMemories();
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
          name: "store_experience",
          description: "Store a new experience or learning in memory",
          inputSchema: {
            type: "object",
            properties: {
              project: { type: "string", description: "Project name" },
              category: { type: "string", description: "Experience category (bug, solution, pattern, etc.)" },
              title: { type: "string", description: "Brief title of the experience" },
              content: { type: "string", description: "Detailed description of the experience" },
              tags: { type: "array", items: { type: "string" }, description: "Relevant tags" },
              context: {
                type: "object",
                properties: {
                  language: { type: "string" },
                  framework: { type: "string" },
                  problem: { type: "string" },
                  solution: { type: "string" },
                },
              },
            },
            required: ["project", "category", "title", "content"],
          },
        },
        {
          name: "search_memories",
          description: "Search memories using RAG-like similarity matching",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              project: { type: "string", description: "Filter by project (optional)" },
              category: { type: "string", description: "Filter by category (optional)" },
              tags: { type: "array", items: { type: "string" }, description: "Filter by tags (optional)" },
              limit: { type: "number", description: "Maximum number of results", default: 5 },
            },
            required: ["query"],
          },
        },
        {
          name: "get_memory_stats",
          description: "Get statistics about stored memories",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "export_memories",
          description: "Export memories to a file",
          inputSchema: {
            type: "object",
            properties: {
              format: { type: "string", enum: ["json", "markdown"], default: "json" },
              project: { type: "string", description: "Filter by project (optional)" },
            },
          },
        },
        {
          name: "import_memories",
          description: "Import memories from a file",
          inputSchema: {
            type: "object",
            properties: {
              filePath: { type: "string", description: "Path to the file to import" },
              format: { type: "string", enum: ["json", "markdown"], default: "json" },
            },
            required: ["filePath"],
          },
        },
      ] as Tool[],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case "store_experience":
            return await this.storeExperience(request.params.arguments);
          case "search_memories":
            return await this.searchMemories(request.params.arguments);
          case "get_memory_stats":
            return await this.getMemoryStats();
          case "export_memories":
            return await this.exportMemories(request.params.arguments);
          case "import_memories":
            return await this.importMemories(request.params.arguments);
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

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "memory://experiences",
          name: "All Experiences",
          description: "Access to all stored experiences and learnings",
          mimeType: "application/json",
        },
        {
          uri: "memory://projects",
          name: "Project List",
          description: "List of all projects with stored experiences",
          mimeType: "application/json",
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      try {
        const uri = request.params.uri;

        if (uri === "memory://experiences") {
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(this.memories, null, 2),
              },
            ],
          };
        } else if (uri === "memory://projects") {
          const projects = [...new Set(this.memories.map(m => m.project))];
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(projects, null, 2),
              },
            ],
          };
        }

        throw new Error(`Unknown resource: ${uri}`);
      } catch (error) {
        throw new Error(`Failed to read resource: ${error}`);
      }
    });
  }

  private async loadMemories(): Promise<void> {
    try {
      if (!existsSync(this.memoryPath)) {
        await mkdir(this.memoryPath, { recursive: true });
      }

      const memoriesFile = join(this.memoryPath, "memories.json");
      if (existsSync(memoriesFile)) {
        const data = await readFile(memoriesFile, "utf-8");
        this.memories = JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load memories:", error);
      this.memories = [];
    }
  }

  private async saveMemories(): Promise<void> {
    try {
      if (!existsSync(this.memoryPath)) {
        await mkdir(this.memoryPath, { recursive: true });
      }

      const memoriesFile = join(this.memoryPath, "memories.json");
      await writeFile(memoriesFile, JSON.stringify(this.memories, null, 2));
    } catch (error) {
      throw new Error(`Failed to save memories: ${error}`);
    }
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async storeExperience(args: any) {
    const memory: MemoryEntry = {
      id: this.generateId(),
      project: args.project,
      category: args.category,
      title: args.title,
      content: args.content,
      tags: args.tags || [],
      timestamp: new Date().toISOString(),
      context: args.context || {},
    };

    this.memories.push(memory);
    await this.saveMemories();

    return {
      content: [
        {
          type: "text",
          text: `Experience stored successfully!
ID: ${memory.id}
Project: ${memory.project}
Category: ${memory.category}
Title: ${memory.title}
Tags: ${memory.tags.join(", ")}
Timestamp: ${memory.timestamp}`,
        },
      ],
    };
  }

  private calculateSimilarity(query: string, memory: MemoryEntry): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    // Check title match (high weight)
    if (memory.title.toLowerCase().includes(queryLower)) {
      score += 50;
    }

    // Check content match (medium weight)
    const contentMatches = (memory.content.toLowerCase().match(new RegExp(queryLower, "g")) || []).length;
    score += contentMatches * 20;

    // Check tag matches (high weight)
    const tagMatches = memory.tags.filter(tag =>
      tag.toLowerCase().includes(queryLower) || queryLower.includes(tag.toLowerCase())
    ).length;
    score += tagMatches * 30;

    // Check context matches (medium weight)
    const contextText = Object.values(memory.context).join(" ").toLowerCase();
    if (contextText.includes(queryLower)) {
      score += 25;
    }

    // Check category match (medium weight)
    if (memory.category.toLowerCase().includes(queryLower)) {
      score += 25;
    }

    return score;
  }

  private async searchMemories(args: any) {
    const { query, project, category, tags, limit = 5 } = args;

    let filteredMemories = this.memories;

    // Apply filters
    if (project) {
      filteredMemories = filteredMemories.filter(m =>
        m.project.toLowerCase().includes(project.toLowerCase())
      );
    }

    if (category) {
      filteredMemories = filteredMemories.filter(m =>
        m.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    if (tags && tags.length > 0) {
      filteredMemories = filteredMemories.filter(m =>
        tags.some((tag: string) =>
          m.tags.some(memTag => memTag.toLowerCase().includes(tag.toLowerCase()))
        )
      );
    }

    // Calculate similarity scores
    const results: SearchResult[] = filteredMemories
      .map(memory => ({
        entry: memory,
        similarity: this.calculateSimilarity(query, memory),
        relevantTags: memory.tags.filter(tag =>
          tag.toLowerCase().includes(query.toLowerCase()) ||
          query.toLowerCase().includes(tag.toLowerCase())
        ),
      }))
      .filter(result => result.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No memories found for query: "${query}"`,
          },
        ],
      };
    }

    const resultsText = results.map((result, index) =>
      `${index + 1}. [Score: ${result.similarity}] ${result.entry.title}
   Project: ${result.entry.project}
   Category: ${result.entry.category}
   Tags: ${result.entry.tags.join(", ")}
   Relevant Tags: ${result.relevantTags.join(", ")}
   Date: ${new Date(result.entry.timestamp).toLocaleDateString()}

   ${result.entry.content}

   Context: ${JSON.stringify(result.entry.context, null, 2)}
`).join("\n---\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} relevant memories for "${query}":

${resultsText}`,
        },
      ],
    };
  }

  private async getMemoryStats() {
    const projects = [...new Set(this.memories.map(m => m.project))];
    const categories = [...new Set(this.memories.map(m => m.category))];
    const allTags = [...new Set(this.memories.flatMap(m => m.tags))];

    const projectCounts = projects.map(project => ({
      project,
      count: this.memories.filter(m => m.project === project).length,
    }));

    const categoryCounts = categories.map(category => ({
      category,
      count: this.memories.filter(m => m.category === category).length,
    }));

    return {
      content: [
        {
          type: "text",
          text: `Memory Statistics:

Total Memories: ${this.memories.length}
Total Projects: ${projects.length}
Total Categories: ${categories.length}
Total Unique Tags: ${allTags.length}

Projects:
${projectCounts.map(p => `  ${p.project}: ${p.count} memories`).join("\n")}

Categories:
${categoryCounts.map(c => `  ${c.category}: ${c.count} memories`).join("\n")}

Most Used Tags:
${allTags.slice(0, 10).join(", ")}

Latest Memories:
${this.memories
  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  .slice(0, 5)
  .map(m => `  ${m.title} (${m.project})`)
  .join("\n")}`,
        },
      ],
    };
  }

  private async exportMemories(args: any) {
    const { format = "json", project } = args;

    let memoriesToExport = this.memories;
    if (project) {
      memoriesToExport = this.memories.filter(m =>
        m.project.toLowerCase().includes(project.toLowerCase())
      );
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `memories_export_${timestamp}.${format}`;
    const filePath = join(this.memoryPath, filename);

    if (format === "json") {
      await writeFile(filePath, JSON.stringify(memoriesToExport, null, 2));
    } else if (format === "markdown") {
      const markdown = memoriesToExport.map(memory =>
        `# ${memory.title}

**Project:** ${memory.project}
**Category:** ${memory.category}
**Tags:** ${memory.tags.join(", ")}
**Date:** ${new Date(memory.timestamp).toLocaleDateString()}

## Content
${memory.content}

## Context
\`\`\`json
${JSON.stringify(memory.context, null, 2)}
\`\`\`

---
`).join("\n");

      await writeFile(filePath, markdown);
    }

    return {
      content: [
        {
          type: "text",
          text: `Memories exported successfully!
File: ${filePath}
Format: ${format}
Memories exported: ${memoriesToExport.length}`,
        },
      ],
    };
  }

  private async importMemories(args: any) {
    const { filePath, format = "json" } = args;

    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const data = await readFile(filePath, "utf-8");
    let importedMemories: MemoryEntry[] = [];

    if (format === "json") {
      importedMemories = JSON.parse(data);
    } else {
      throw new Error("Markdown import not yet implemented");
    }

    // Validate and add unique IDs if needed
    importedMemories.forEach(memory => {
      if (!memory.id) {
        memory.id = this.generateId();
      }
      if (!memory.timestamp) {
        memory.timestamp = new Date().toISOString();
      }
    });

    this.memories.push(...importedMemories);
    await this.saveMemories();

    return {
      content: [
        {
          type: "text",
          text: `Memories imported successfully!
File: ${filePath}
Imported: ${importedMemories.length} memories
Total memories: ${this.memories.length}`,
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Memory MCP Server running on stdio");
  }
}

const server = new MemoryMCPServer();
server.run().catch(console.error);