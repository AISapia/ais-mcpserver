# AIS MCP Server Collection

A comprehensive collection of Model Context Protocol (MCP) servers designed to enhance AI-powered development workflows with specialized tools and data sources.

## Overview

This repository contains 5 specialized MCP servers that provide secure, controlled access to various development tools and data sources:

1. **INFO MCP** - System and tool information provider
2. **GIT RUNNER MCP** - Automated git operations with AI-generated commit messages
3. **Memory MCP** - RAG-based experience sharing between projects
4. **GitHub MCP** - GitHub integration and repository management
5. **Rules MCP** - Rule management system with RAG-based lookup

## Features

### 🔍 INFO MCP Server
- System information and environment details
- GitHub CLI status and authentication checking
- Available AI agents and capabilities overview
- Development environment analysis

### 🚀 GIT RUNNER MCP Server
- Automated git commit and push operations
- AI-generated commit messages based on code changes
- Configurable auto-commit service with customizable intervals
- Smart change analysis and commit message generation

### 🧠 Memory MCP Server
- Store and retrieve development experiences across projects
- RAG-like similarity search for finding relevant past solutions
- Project-based experience categorization
- Export/import functionality for knowledge sharing

### 🐙 GitHub MCP Server
- Complete GitHub repository management
- Issue and pull request operations
- Branch management and code search
- Release information and repository statistics

### 📋 Rules MCP Server
- Centralized rule and guideline management
- Category-based organization (coding, git, security, testing, documentation)
- RAG-based rule lookup and search
- Default best practices included

## Installation

1. Clone the repository:
```bash
git clone https://github.com/AISapia/ais-mcpserver.git
cd ais-mcpserver
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

Each MCP server can be run independently:

### Running Individual Servers

```bash
# INFO MCP Server
npm run info

# GIT RUNNER MCP Server
npm run git-runner

# Memory MCP Server
npm run memory

# GitHub MCP Server
npm run github

# Rules MCP Server
npm run rules
```

### Using with Claude Code

To use these servers with Claude Code, add them to your MCP configuration. Each server communicates via stdio and provides tools that can be invoked by AI models.

## Server Details

### INFO MCP Server

**Tools:**
- `get_system_info` - System platform and environment information
- `check_gh_status` - GitHub CLI installation and authentication status
- `check_available_agents` - Available AI agents (Claude Code, Qwen-Coder, Gemini)
- `get_environment_info` - Current directory and git repository information

### GIT RUNNER MCP Server

**Tools:**
- `start_git_runner` - Start automated git service with optional auto-commit
- `stop_git_runner` - Stop the git automation service
- `git_commit_with_ai` - Create AI-generated commit message and commit
- `git_push` - Push committed changes to remote repository
- `get_git_status` - Current git repository status
- `get_runner_status` - Git Runner service status

**Features:**
- Smart commit message generation based on file changes
- Automatic change type detection (feat, fix, chore, refactor)
- Configurable auto-commit intervals
- Support for specific file commits

### Memory MCP Server

**Tools:**
- `store_experience` - Store new development experience or learning
- `search_memories` - RAG-like search across stored experiences
- `get_memory_stats` - Statistics about stored memories
- `export_memories` - Export memories in JSON or Markdown format
- `import_memories` - Import memories from external files

**Resources:**
- `memory://experiences` - Access to all stored experiences
- `memory://projects` - List of projects with stored experiences

**Storage Location:** `/MCP/Memory/`

### GitHub MCP Server

**Tools:**
- `list_issues` - List repository issues with filtering
- `create_issue` - Create new issues with assignees and labels
- `update_issue` - Update existing issues
- `list_pull_requests` - List PRs with state filtering
- `create_pull_request` - Create new pull requests
- `get_repository_info` - Repository statistics and information
- `list_branches` - List local and remote branches
- `create_branch` - Create new branches
- `search_code` - Search code within the repository
- `get_release_info` - Repository release information

### Rules MCP Server

**Tools:**
- `create_rule` - Create new rules with categories and tags
- `search_rules` - RAG-based rule search and lookup
- `get_rule_by_id` - Retrieve specific rules by ID
- `update_rule` - Update existing rules
- `delete_rule` - Remove rules
- `list_categories` - List all rule categories
- `create_category` - Create new rule categories
- `get_rules_by_category` - Get rules by category
- `export_rules` - Export rules in JSON or Markdown
- `import_rules` - Import rules from files

**Resources:**
- `rules://all` - Access to all stored rules
- `rules://categories` - List of rule categories

**Storage Location:** `/MCP/Rules/`

**Default Categories:**
- `coding` - Programming and development rules
- `git` - Git workflow and versioning rules
- `security` - Security best practices
- `testing` - Testing methodologies
- `documentation` - Documentation standards

## Architecture

All servers follow the MCP specification:
- JSON-RPC 2.0 communication protocol
- Stdio transport for local integration
- Stateful connections with capability negotiation
- Secure tool execution with proper error handling

## Security Features

- No secrets or credentials stored in code
- Proper input validation and sanitization
- Secure file operations with path validation
- Error isolation to prevent information leakage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes following existing patterns
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Requirements

- Node.js 18+
- TypeScript 5+
- GitHub CLI (gh) for GitHub MCP server
- Git for GIT RUNNER MCP server

## Troubleshooting

### Common Issues

1. **Build Errors**: Ensure TypeScript dependencies are installed
2. **GitHub CLI Issues**: Run `gh auth login` to authenticate
3. **Permission Errors**: Check file system permissions for Memory and Rules storage
4. **Transport Errors**: Ensure stdio transport is properly configured

## Support

For issues and questions:
1. Check the GitHub issues in this repository
2. Review MCP specification documentation
3. Create a new issue with detailed reproduction steps

---

Generated with 🤖 Claude Code MCP Integration