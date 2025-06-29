import {Logger} from '../logger.js';
import type {CommandResult} from '../types.js';
import type {LLMService} from './llm-service.js';
import type {MCPConfigService} from './mcp-config-service.js';

/**
 * Service that handles utility commands like help, logs, history, and status.
 * These commands provide information and debugging capabilities but don't
 * modify the core application state.
 */
export class UtilityService {
	private llmService: LLMService;

	/**
	 * Creates a new UtilityService instance.
	 * @param deps - Dependencies required by the service
	 * @param deps.llmService - Service for LLM operations (used for status)
	 * @param deps.mcpConfigService - Service for MCP config (used for status)
	 */
	constructor(deps: {
		llmService: LLMService;
		mcpConfigService: MCPConfigService;
	}) {
		this.llmService = deps.llmService;
		// mcpConfigService is passed but not used currently
		// Kept in constructor signature for potential future use and API consistency
	}

	/**
	 * Handles the /help command to show available commands.
	 * @returns A CommandResult with the help text
	 */
	handleHelpCommand(): CommandResult {
		const helpText = `
Available slash commands:

🤖 Get Started:
  /model <provider> <model>  - Choose your LLM (CLI handles API key setup)
  /models [provider]         - List available models for a provider

🔌 MCP Servers:
  /server add                - Configure a new server (auto-connects)
  /server connect <name>     - Connect to a configured server by name  
  /server disconnect <name>  - Disconnect from a connected server
  /servers                   - List servers and their connection status
  /tools                     - Show available tools from connected servers
  /test-server <name>        - Test if a server package can be started

🔑 API Keys (automatic):
  /setkey <provider> <key>   - Set API key manually (stored securely)
  /clearkeys                 - Clear all stored API keys

⚙️  Configuration:
  /config temp <value>       - Set temperature (0.0-2.0)
  /config tokens <value>     - Set max tokens
  /help                      - Show this help

🛠️  Debugging & History:
  /logs [path|tail]          - View debug logs (written to ~/.mcp-use-cli/debug.log)
  /clearlogs                 - Clear debug logs
  /history                   - Info about input history navigation (↑↓ arrows)

📋 Quick Start Examples:
  /model openai gpt-4o-mini
  /server add                # Interactive server setup
  /servers
  /config temp 0.5
		`.trim();

		return {
			type: 'info',
			message: helpText,
		};
	}

	/**
	 * Handles the /status command to show current configuration.
	 * @returns A CommandResult with the current status
	 */
	handleStatusCommand(): CommandResult {
		const availableProviders = this.llmService.getAvailableProviders();
		const currentConfig = this.llmService.getCurrentConfig();
		const apiKeyStatus = this.llmService.getApiKeyStatus();

		let statusText = '🤖 Current Configuration:\n\n';

		// API Keys status
		statusText += '🔑 API Keys:\n';
		Object.entries(apiKeyStatus).forEach(([provider, status]) => {
			if (status.status === 'set') {
				statusText += `  • ${provider}: ${status.masked} (${status.source})\n`;
			} else {
				statusText += `  • ${provider}: ❌ not set\n`;
			}
		});

		statusText += '\n';

		// Current model
		if (!currentConfig) {
			if (availableProviders.length === 0) {
				statusText += '⚠️ No model selected\n';
				statusText += '\nChoose a model to get started:\n';
				statusText += '• /model openai gpt-4o-mini\n';
				statusText += '• /model anthropic claude-3-5-sonnet-20241022\n';
				statusText += '• /model google gemini-1.5-pro\n';
				statusText += '\nThe CLI will help you set up API keys when needed.';
			} else {
				statusText += '⚠️ No model selected\n';
				statusText += `\nAvailable providers: ${availableProviders.join(
					', ',
				)}\n`;
				statusText += 'Use /model <provider> <model> to get started';
			}
		} else {
			statusText += `🎯 Active Model:\n`;
			statusText += `  Provider: ${currentConfig.provider}\n`;
			statusText += `  Model: ${currentConfig.model}\n`;
			statusText += `  Temperature: ${currentConfig.temperature || 0.7}\n`;
			statusText += `  Max Tokens: ${currentConfig.maxTokens || 'default'}\n`;
			statusText +=
				'\nUse /model to switch models or /config to adjust settings';
		}

		return {
			type: 'info',
			message: statusText,
		};
	}

	/**
	 * Handles the /logs command and its subcommands.
	 * @param args - Array of arguments where args[0] is the subcommand
	 * @returns A CommandResult with log information
	 */
	handleLogsCommand(args: string[]): CommandResult {
		const logPath = Logger.getLogPath();

		if (args.length === 0) {
			return {
				type: 'info',
				message: `📋 Debug logs are written to:\n${logPath}\n\nCommands:\n  /logs path    - Show log file path\n  /logs tail    - Show recent log entries\n  /clearlogs    - Clear all logs\n\nTo view logs in real-time:\n  tail -f ${logPath}`,
			};
		}

		const subcommand = args[0];

		switch (subcommand) {
			case 'path':
				return {
					type: 'info',
					message: `📁 Log file location:\n${logPath}`,
				};

			case 'tail':
				try {
					const fs = require('fs');
					if (!fs.existsSync(logPath)) {
						return {
							type: 'info',
							message:
								'📋 No log file found yet. Logs will be created when the app starts logging.',
						};
					}

					const logContent = fs.readFileSync(logPath, 'utf8');
					const lines = logContent
						.split('\n')
						.filter((line: string) => line.trim());
					const recentLines = lines.slice(-20); // Show last 20 lines

					if (recentLines.length === 0) {
						return {
							type: 'info',
							message: '📋 Log file is empty.',
						};
					}

					return {
						type: 'info',
						message: `📋 Recent log entries (last ${
							recentLines.length
						} lines):\n\n${recentLines.join('\n')}`,
					};
				} catch (error) {
					return {
						type: 'error',
						message: `❌ Failed to read logs: ${
							error instanceof Error ? error.message : 'Unknown error'
						}`,
					};
				}

			default:
				return {
					type: 'error',
					message: `Unknown logs subcommand: ${subcommand}. Use /logs for help.`,
				};
		}
	}

	/**
	 * Handles the /clearlogs command to clear debug logs.
	 * @returns A CommandResult indicating success or failure
	 */
	handleClearLogsCommand(): CommandResult {
		try {
			Logger.clearLogs();
			Logger.info('Logs cleared by user command');
			return {
				type: 'success',
				message: '✅ Debug logs cleared successfully.',
			};
		} catch (error) {
			return {
				type: 'error',
				message: `❌ Failed to clear logs: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			};
		}
	}

	/**
	 * Handles the /history command to show input history navigation info.
	 * @returns A CommandResult with history navigation instructions
	 */
	handleHistoryCommand(): CommandResult {
		return {
			type: 'info',
			message: `📜 Input History Navigation:\n\n🔼 Arrow Up   - Navigate to previous inputs\n🔽 Arrow Down - Navigate to newer inputs\n\n💡 Tips:\n• Your input history is automatically saved during the session\n• Use ↑ to recall previous commands and messages\n• Use ↓ to navigate back to newer inputs\n• History is reset when you restart the CLI\n\n🎯 Try it now: Press the up arrow key in the input box!`,
		};
	}
}
