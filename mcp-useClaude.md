# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

```bash
npm run build        # Build TypeScript to dist/ (always run before testing)
npm run watch        # Watch mode for development
npm run lint         # Run ESLint checks
npm run lint:fix     # Fix linting issues automatically
```

### Testing Examples

```bash
# Run individual examples (build first!)
npm run example:chat       # Interactive chat with MCP tools
npm run example:filesystem # Test filesystem operations
npm run example:browser    # Browser automation example
npm run example:everything # Test all MCP features
```

### Release Process

```bash
npm run release       # Patch release (0.0.x)
npm run release:minor # Minor release (0.x.0)
npm run release:major # Major release (x.0.0)
```

## Architecture Overview

This is a unified MCP (Model Context Protocol) client library that bridges LLMs with MCP servers.

### Core Components

1. **MCPClient** (`src/client.ts`): Main entry point, manages multiple MCP sessions

   - Creates from config dict or JSON file
   - Handles server selection and session management

2. **MCPSession** (`src/session.ts`): Individual MCP server connection

   - Manages tool execution and resource access
   - Supports stdio, HTTP/SSE, and WebSocket connections

3. **MCPAgent** (`src/agents/MCPAgent.ts`): LLM + MCP tools orchestration

   - Executes multi-step tasks using LangChain
   - Handles tool safety and execution limits

4. **LangChainAdapter** (`src/adapters/LangChainAdapter.ts`): Converts MCP tools to LangChain format
   - Enables any LangChain LLM to use MCP tools
   - Handles schema conversion and validation

### Connection Flow

```
LLM → MCPAgent → MCPClient → MCPSession → Connector → MCP Server
```

### Configuration Pattern

MCP servers are configured in a dictionary format:

```typescript
{
  mcpServers: {
    serverName: {
      command: 'command',
      args: ['arg1', 'arg2'],
      env: { KEY: 'value' }
    }
  }
}
```

## Development Requirements

- **Node.js 22+** required (uses modern Node.js features)
- **TypeScript ES Modules** - use ES import/export syntax
- **Environment variables** - examples need `.env` file with API keys
- **Pre-commit hooks** - Husky runs lint and build checks

## Important Implementation Notes

1. Always run `npm run build` before testing changes
2. The project uses Winston for logging - check `src/logging.ts` for configuration
3. Tool safety can be configured - see `dangerousTools` option in MCPClient
4. Multiple MCP servers can be used simultaneously
5. Each example in `examples/` demonstrates different MCP capabilities
6. The project follows Conventional Commits specification
