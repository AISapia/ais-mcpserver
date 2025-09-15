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
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

interface Rule {
  id: string;
  title: string;
  category: string;
  description: string;
  content: string;
  tags: string[];
  examples: string[];
  relatedRules: string[];
  timestamp: string;
  version: string;
}

interface RuleCategory {
  name: string;
  description: string;
  rules: string[];
}

class RulesMCPServer {
  private server: Server;
  private rulesPath: string;
  private rules: Rule[] = [];
  private categories: RuleCategory[] = [];

  constructor() {
    this.rulesPath = "/home/ubuntu/MCP/Rules";
    this.server = new Server(
      {
        name: "rules-mcp",
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
    this.loadRules();
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
          name: "create_rule",
          description: "Create a new rule",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Rule title" },
              category: { type: "string", description: "Rule category" },
              description: { type: "string", description: "Brief description" },
              content: { type: "string", description: "Detailed rule content" },
              tags: { type: "array", items: { type: "string" }, description: "Rule tags" },
              examples: { type: "array", items: { type: "string" }, description: "Usage examples" },
            },
            required: ["title", "category", "content"],
          },
        },
        {
          name: "search_rules",
          description: "Search rules using RAG-like similarity matching",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              category: { type: "string", description: "Filter by category" },
              tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
              limit: { type: "number", description: "Maximum results", default: 5 },
            },
            required: ["query"],
          },
        },
        {
          name: "get_rule_by_id",
          description: "Get a specific rule by ID",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Rule ID" },
            },
            required: ["id"],
          },
        },
        {
          name: "update_rule",
          description: "Update an existing rule",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Rule ID" },
              title: { type: "string" },
              category: { type: "string" },
              description: { type: "string" },
              content: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              examples: { type: "array", items: { type: "string" } },
            },
            required: ["id"],
          },
        },
        {
          name: "delete_rule",
          description: "Delete a rule by ID",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Rule ID" },
            },
            required: ["id"],
          },
        },
        {
          name: "list_categories",
          description: "List all rule categories",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "create_category",
          description: "Create a new rule category",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Category name" },
              description: { type: "string", description: "Category description" },
            },
            required: ["name"],
          },
        },
        {
          name: "get_rules_by_category",
          description: "Get all rules in a specific category",
          inputSchema: {
            type: "object",
            properties: {
              category: { type: "string", description: "Category name" },
            },
            required: ["category"],
          },
        },
        {
          name: "export_rules",
          description: "Export rules to a file",
          inputSchema: {
            type: "object",
            properties: {
              format: { type: "string", enum: ["json", "markdown"], default: "json" },
              category: { type: "string", description: "Filter by category" },
            },
          },
        },
        {
          name: "import_rules",
          description: "Import rules from a file",
          inputSchema: {
            type: "object",
            properties: {
              filePath: { type: "string", description: "Path to import file" },
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
          case "create_rule":
            return await this.createRule(request.params.arguments);
          case "search_rules":
            return await this.searchRules(request.params.arguments);
          case "get_rule_by_id":
            return await this.getRuleById(request.params.arguments);
          case "update_rule":
            return await this.updateRule(request.params.arguments);
          case "delete_rule":
            return await this.deleteRule(request.params.arguments);
          case "list_categories":
            return await this.listCategories();
          case "create_category":
            return await this.createCategory(request.params.arguments);
          case "get_rules_by_category":
            return await this.getRulesByCategory(request.params.arguments);
          case "export_rules":
            return await this.exportRules(request.params.arguments);
          case "import_rules":
            return await this.importRules(request.params.arguments);
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
          uri: "rules://all",
          name: "All Rules",
          description: "Access to all stored rules",
          mimeType: "application/json",
        },
        {
          uri: "rules://categories",
          name: "Rule Categories",
          description: "List of all rule categories",
          mimeType: "application/json",
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      try {
        const uri = request.params.uri;

        if (uri === "rules://all") {
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(this.rules, null, 2),
              },
            ],
          };
        } else if (uri === "rules://categories") {
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(this.categories, null, 2),
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

  private async loadRules(): Promise<void> {
    try {
      if (!existsSync(this.rulesPath)) {
        await mkdir(this.rulesPath, { recursive: true });
        await this.initializeDefaultRules();
      }

      const rulesFile = join(this.rulesPath, "rules.json");
      const categoriesFile = join(this.rulesPath, "categories.json");

      if (existsSync(rulesFile)) {
        const rulesData = await readFile(rulesFile, "utf-8");
        this.rules = JSON.parse(rulesData);
      }

      if (existsSync(categoriesFile)) {
        const categoriesData = await readFile(categoriesFile, "utf-8");
        this.categories = JSON.parse(categoriesData);
      }
    } catch (error) {
      console.error("Failed to load rules:", error);
      this.rules = [];
      this.categories = [];
    }
  }

  private async saveRules(): Promise<void> {
    try {
      if (!existsSync(this.rulesPath)) {
        await mkdir(this.rulesPath, { recursive: true });
      }

      const rulesFile = join(this.rulesPath, "rules.json");
      const categoriesFile = join(this.rulesPath, "categories.json");

      await writeFile(rulesFile, JSON.stringify(this.rules, null, 2));
      await writeFile(categoriesFile, JSON.stringify(this.categories, null, 2));
    } catch (error) {
      throw new Error(`Failed to save rules: ${error}`);
    }
  }

  private async initializeDefaultRules(): Promise<void> {
    const defaultCategories: RuleCategory[] = [
      {
        name: "coding",
        description: "Programming and development rules",
        rules: [],
      },
      {
        name: "git",
        description: "Git workflow and versioning rules",
        rules: [],
      },
      {
        name: "security",
        description: "Security best practices and rules",
        rules: [],
      },
      {
        name: "testing",
        description: "Testing methodologies and practices",
        rules: [],
      },
      {
        name: "documentation",
        description: "Documentation standards and guidelines",
        rules: [],
      },
    ];

    const defaultRules: Rule[] = [
      {
        id: "coding-001",
        title: "Function Naming Convention",
        category: "coding",
        description: "Use descriptive and consistent function names",
        content: "Functions should have clear, descriptive names that indicate their purpose. Use camelCase for JavaScript/TypeScript, snake_case for Python, and follow language-specific conventions.",
        tags: ["naming", "functions", "conventions"],
        examples: [
          "getUserData() instead of getData()",
          "calculateTotalPrice() instead of calc()",
          "validateEmailAddress() instead of check()"
        ],
        relatedRules: ["coding-002"],
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
      {
        id: "git-001",
        title: "Commit Message Format",
        category: "git",
        description: "Use conventional commit messages",
        content: "Follow the format: type(scope): description\n\nTypes: feat, fix, docs, style, refactor, test, chore\nScope: optional, indicates the area of change\nDescription: brief summary in imperative mood",
        tags: ["git", "commits", "messages"],
        examples: [
          "feat(auth): add user authentication",
          "fix(api): resolve timeout issue",
          "docs(readme): update installation guide"
        ],
        relatedRules: ["git-002"],
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
      {
        id: "security-001",
        title: "Environment Variables",
        category: "security",
        description: "Never commit secrets to version control",
        content: "Store sensitive information like API keys, passwords, and tokens in environment variables. Use .env files for local development and ensure they're in .gitignore.",
        tags: ["security", "secrets", "environment"],
        examples: [
          "Use process.env.API_KEY instead of hardcoding",
          "Add .env to .gitignore",
          "Use different .env files for different environments"
        ],
        relatedRules: ["security-002"],
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      }
    ];

    this.categories = defaultCategories;
    this.rules = defaultRules;

    // Update category rule references
    this.categories.forEach(category => {
      category.rules = this.rules
        .filter(rule => rule.category === category.name)
        .map(rule => rule.id);
    });

    await this.saveRules();
  }

  private generateId(category: string): string {
    const prefix = category.substring(0, 3).toLowerCase();
    const count = this.rules.filter(r => r.category === category).length + 1;
    return `${prefix}-${count.toString().padStart(3, '0')}`;
  }

  private calculateSimilarity(query: string, rule: Rule): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    // Title match (high weight)
    if (rule.title.toLowerCase().includes(queryLower)) {
      score += 50;
    }

    // Content match (medium weight)
    const contentMatches = (rule.content.toLowerCase().match(new RegExp(queryLower, "g")) || []).length;
    score += contentMatches * 15;

    // Tag matches (high weight)
    const tagMatches = rule.tags.filter(tag =>
      tag.toLowerCase().includes(queryLower) || queryLower.includes(tag.toLowerCase())
    ).length;
    score += tagMatches * 40;

    // Category match (medium weight)
    if (rule.category.toLowerCase().includes(queryLower)) {
      score += 30;
    }

    // Description match (medium weight)
    if (rule.description.toLowerCase().includes(queryLower)) {
      score += 25;
    }

    // Examples match (low weight)
    const exampleMatches = rule.examples.filter(example =>
      example.toLowerCase().includes(queryLower)
    ).length;
    score += exampleMatches * 10;

    return score;
  }

  private async createRule(args: any) {
    const rule: Rule = {
      id: this.generateId(args.category),
      title: args.title,
      category: args.category,
      description: args.description || "",
      content: args.content,
      tags: args.tags || [],
      examples: args.examples || [],
      relatedRules: [],
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    };

    this.rules.push(rule);

    // Update category
    let category = this.categories.find(c => c.name === args.category);
    if (!category) {
      category = {
        name: args.category,
        description: `Rules for ${args.category}`,
        rules: [],
      };
      this.categories.push(category);
    }
    category.rules.push(rule.id);

    await this.saveRules();

    return {
      content: [
        {
          type: "text",
          text: `Rule created successfully!
ID: ${rule.id}
Title: ${rule.title}
Category: ${rule.category}
Tags: ${rule.tags.join(", ")}`,
        },
      ],
    };
  }

  private async searchRules(args: any) {
    const { query, category, tags, limit = 5 } = args;

    let filteredRules = this.rules;

    // Apply filters
    if (category) {
      filteredRules = filteredRules.filter(r =>
        r.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    if (tags && tags.length > 0) {
      filteredRules = filteredRules.filter(r =>
        tags.some((tag: string) =>
          r.tags.some(ruleTag => ruleTag.toLowerCase().includes(tag.toLowerCase()))
        )
      );
    }

    // Calculate similarity scores
    const results = filteredRules
      .map(rule => ({
        rule,
        similarity: this.calculateSimilarity(query, rule),
      }))
      .filter(result => result.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No rules found for query: "${query}"`,
          },
        ],
      };
    }

    const resultsText = results.map((result, index) =>
      `${index + 1}. [Score: ${result.similarity}] ${result.rule.title} (${result.rule.id})
   Category: ${result.rule.category}
   Tags: ${result.rule.tags.join(", ")}
   Description: ${result.rule.description}

   ${result.rule.content}

   Examples:
   ${result.rule.examples.map(ex => `   - ${ex}`).join("\n")}
`).join("\n---\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} relevant rules for "${query}":

${resultsText}`,
        },
      ],
    };
  }

  private async getRuleById(args: any) {
    const { id } = args;
    const rule = this.rules.find(r => r.id === id);

    if (!rule) {
      throw new Error(`Rule not found: ${id}`);
    }

    const relatedRules = rule.relatedRules
      .map(relatedId => this.rules.find(r => r.id === relatedId))
      .filter(Boolean)
      .map(r => `${r!.id}: ${r!.title}`)
      .join("\n   ");

    return {
      content: [
        {
          type: "text",
          text: `Rule: ${rule.title} (${rule.id})

Category: ${rule.category}
Description: ${rule.description}
Tags: ${rule.tags.join(", ")}
Version: ${rule.version}
Created: ${new Date(rule.timestamp).toLocaleDateString()}

Content:
${rule.content}

Examples:
${rule.examples.map(ex => `- ${ex}`).join("\n")}

${relatedRules ? `Related Rules:\n   ${relatedRules}` : ""}`,
        },
      ],
    };
  }

  private async updateRule(args: any) {
    const { id, ...updates } = args;
    const ruleIndex = this.rules.findIndex(r => r.id === id);

    if (ruleIndex === -1) {
      throw new Error(`Rule not found: ${id}`);
    }

    this.rules[ruleIndex] = {
      ...this.rules[ruleIndex],
      ...updates,
      timestamp: new Date().toISOString(),
    };

    await this.saveRules();

    return {
      content: [
        {
          type: "text",
          text: `Rule ${id} updated successfully!`,
        },
      ],
    };
  }

  private async deleteRule(args: any) {
    const { id } = args;
    const ruleIndex = this.rules.findIndex(r => r.id === id);

    if (ruleIndex === -1) {
      throw new Error(`Rule not found: ${id}`);
    }

    const rule = this.rules[ruleIndex];
    this.rules.splice(ruleIndex, 1);

    // Update category
    const category = this.categories.find(c => c.name === rule.category);
    if (category) {
      category.rules = category.rules.filter(ruleId => ruleId !== id);
    }

    await this.saveRules();

    return {
      content: [
        {
          type: "text",
          text: `Rule ${id} deleted successfully!`,
        },
      ],
    };
  }

  private async listCategories() {
    const categoryList = this.categories.map(category =>
      `${category.name}: ${category.description}
   Rules: ${category.rules.length}
   Rule IDs: ${category.rules.join(", ")}`
    ).join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Rule Categories (${this.categories.length}):

${categoryList}`,
        },
      ],
    };
  }

  private async createCategory(args: any) {
    const { name, description = `Rules for ${name}` } = args;

    if (this.categories.find(c => c.name === name)) {
      throw new Error(`Category already exists: ${name}`);
    }

    const category: RuleCategory = {
      name,
      description,
      rules: [],
    };

    this.categories.push(category);
    await this.saveRules();

    return {
      content: [
        {
          type: "text",
          text: `Category '${name}' created successfully!`,
        },
      ],
    };
  }

  private async getRulesByCategory(args: any) {
    const { category } = args;

    const rules = this.rules.filter(r =>
      r.category.toLowerCase().includes(category.toLowerCase())
    );

    if (rules.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No rules found in category: ${category}`,
          },
        ],
      };
    }

    const rulesList = rules.map(rule =>
      `${rule.id}: ${rule.title}
   Description: ${rule.description}
   Tags: ${rule.tags.join(", ")}`
    ).join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Rules in category '${category}' (${rules.length}):

${rulesList}`,
        },
      ],
    };
  }

  private async exportRules(args: any) {
    const { format = "json", category } = args;

    let rulesToExport = this.rules;
    if (category) {
      rulesToExport = this.rules.filter(r =>
        r.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `rules_export_${timestamp}.${format}`;
    const filePath = join(this.rulesPath, filename);

    if (format === "json") {
      await writeFile(filePath, JSON.stringify(rulesToExport, null, 2));
    } else if (format === "markdown") {
      const markdown = rulesToExport.map(rule =>
        `# ${rule.title} (${rule.id})

**Category:** ${rule.category}
**Tags:** ${rule.tags.join(", ")}
**Version:** ${rule.version}
**Created:** ${new Date(rule.timestamp).toLocaleDateString()}

## Description
${rule.description}

## Content
${rule.content}

## Examples
${rule.examples.map(ex => `- ${ex}`).join("\n")}

---
`).join("\n");

      await writeFile(filePath, markdown);
    }

    return {
      content: [
        {
          type: "text",
          text: `Rules exported successfully!
File: ${filePath}
Format: ${format}
Rules exported: ${rulesToExport.length}`,
        },
      ],
    };
  }

  private async importRules(args: any) {
    const { filePath, format = "json" } = args;

    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const data = await readFile(filePath, "utf-8");
    let importedRules: Rule[] = [];

    if (format === "json") {
      importedRules = JSON.parse(data);
    } else {
      throw new Error("Markdown import not yet implemented");
    }

    // Validate and update rules
    importedRules.forEach(rule => {
      if (!rule.id) {
        rule.id = this.generateId(rule.category);
      }
      if (!rule.timestamp) {
        rule.timestamp = new Date().toISOString();
      }
    });

    this.rules.push(...importedRules);

    // Update categories
    importedRules.forEach(rule => {
      let category = this.categories.find(c => c.name === rule.category);
      if (!category) {
        category = {
          name: rule.category,
          description: `Rules for ${rule.category}`,
          rules: [],
        };
        this.categories.push(category);
      }
      if (!category.rules.includes(rule.id)) {
        category.rules.push(rule.id);
      }
    });

    await this.saveRules();

    return {
      content: [
        {
          type: "text",
          text: `Rules imported successfully!
File: ${filePath}
Imported: ${importedRules.length} rules
Total rules: ${this.rules.length}`,
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Rules MCP Server running on stdio");
  }
}

const server = new RulesMCPServer();
server.run().catch(console.error);