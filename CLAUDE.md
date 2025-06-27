# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run build` - Compile TypeScript to JavaScript in the `dist/` directory
- `npm run dev` - Run TypeScript compiler in watch mode for development
- `npm test` - Run all checks: Prettier formatting, XO linting, and AVA tests
- `npm link` - Link the CLI globally for testing (run after build)
- `mcp-use` - Run the CLI after linking

### Code Quality
- `npx prettier --check .` - Check code formatting
- `npx prettier --write .` - Fix code formatting
- `npx xo` - Run linting
- `npx xo --fix` - Fix linting issues
- `npx ava` - Run tests only

## Architecture

### Core Flow
1. **cli.tsx** - Entry point that sets up the meow CLI and launches the React app
2. **app.tsx** - Main React component that renders the terminal UI using Ink
3. **mcp-service.ts** - Singleton service that manages MCP connections and LLM interactions
4. **commands.ts** - Handles slash commands (e.g., /help, /servers, /clear)
5. **storage.ts** - Manages encrypted storage of API keys and configuration

### Key Architectural Decisions

#### MCP Integration
- Uses the `mcp-use` library for Model Context Protocol integration
- Supports multiple MCP servers simultaneously through session management
- Tools from all connected servers are aggregated and made available to the LLM

#### State Management
- React hooks (useState, useEffect) for UI state
- MCPService singleton for global state (agent, sessions, configuration)
- Session servers stored separately from configured servers

#### Security
- API keys encrypted with AES-256-CBC before storage
- Configuration stored in `~/.mcp-use-cli/config.json`
- Environment variables supported as fallback for API keys

#### UI Components
- Uses Ink for terminal rendering with React components
- Custom TextInput component for user input with history navigation
- Real-time status display for model and server connections

### Important Patterns

1. **Error Handling**: Consistent try-catch blocks with Logger.error for debugging
2. **Async Operations**: All MCP and LLM operations are async with proper error handling
3. **Tool Discovery**: Tools are discovered dynamically from connected MCP servers
4. **Message Streaming**: LLM responses are streamed for better UX

### File Locations
- User configuration: `~/.mcp-use-cli/config.json`
- Debug logs: `~/.mcp-use-cli/debug.log`
- Built output: `dist/`

## Testing Approach

Currently, the project has AVA configured but no tests implemented. When adding tests:
- Place test files next to source files with `.test.ts` extension
- Use AVA's TypeScript support (already configured)
- Mock the MCPService for UI component tests
- Test file operations in storage.ts with temporary directories