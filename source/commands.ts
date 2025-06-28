import {Logger} from './logger.js';
import {LLMService} from './services/llm-service.js';
import {MCPConfigService} from './services/mcp-config-service.js';
import {AgentService} from './services/agent-service.js';

export interface CommandResult {
	type: 'success' | 'error' | 'info' | 'prompt_key' | 'prompt_server_config';
	message: string;
	data?: any;
}

export class CommandHandler {
	private llmService: LLMService;
	private mcpService: MCPConfigService;
	private agentService: AgentService;

	constructor() {
		// Initialize services
		this.llmService = new LLMService();
		this.mcpService = new MCPConfigService();
		this.agentService = new AgentService({
			llmService: this.llmService,
			mcpService: this.mcpService,
		});
	}

	// Delegate to services
	getAvailableProviders(): string[] {
		return this.llmService.getAvailableProviders();
	}

	isAnyProviderAvailable(): boolean {
		return this.llmService.isAnyProviderAvailable();
	}

	getAgentService(): AgentService {
		return this.agentService;
	}

	getLLMService(): LLMService {
		return this.llmService;
	}

	getMCPService(): MCPConfigService {
		return this.mcpService;
	}

	async handleCommand(input: string): Promise<CommandResult> {
		const parts = input.trim().split(/\s+/);
		const command = parts[0];
		const args = parts.slice(1);

		switch (command) {
			case '/help':
				return this.handleHelp();
			case '/model':
				return this.handleModel(args);
			case '/models':
				return this.handleListModels(args);
			case '/status':
				return this.handleStatus();
			case '/config':
				return this.handleConfig(args);
			case '/setkey':
				return this.handleSetKey(args);
			case '/clearkeys':
				return this.handleClearKeys();
			case '/server':
				return this.handleServer(args);
			case '/servers':
				return this.handleListServers();
			case '/tools':
				return this.handleListTools();
			case '/test-server':
				return this.handleTestServer(args);
			case '/logs':
				return this.handleLogs(args);
			case '/clearlogs':
				return this.handleClearLogs();
			case '/history':
				return this.handleHistory();
			default:
				return {
					type: 'error',
					message: `Unknown command: ${command}. Type /help for available commands.`,
				};
		}
	}

	private handleHelp(): CommandResult {
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
  /status                    - Show current configuration

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

	private handleModel(args: string[]): CommandResult {
		if (args.length < 2) {
			const availableProviders = this.getAvailableProviders();
			if (availableProviders.length === 0) {
				return {
					type: 'info',
					message:
						'Usage: /model <provider> <model>\n\nPopular models to try:\n• /model openai gpt-4o-mini\n• /model anthropic claude-3-5-sonnet-20241022\n• /model google gemini-1.5-pro\n\nThe CLI will prompt for your API key when needed.\nUse /models to see all available options.',
				};
			}
			return {
				type: 'error',
				message: `Usage: /model <provider> <model>\nExample: /model openai gpt-4o\n\nAvailable providers: ${availableProviders.join(
					', ',
				)}`,
			};
		}

		const provider = args[0];
		const model = args[1];

		if (!provider || !model) {
			return {
				type: 'error',
				message: 'Both provider and model are required',
			};
		}

		const availableModels = this.llmService.getAvailableModels() as Record<
			string,
			string[]
		>;
		if (!availableModels[provider]) {
			return {
				type: 'error',
				message: `Unknown provider: ${provider}\nAvailable providers: ${Object.keys(
					availableModels,
				).join(', ')}`,
			};
		}

		// Try to set the model
		const result = this.llmService.setModel(provider, model);

		if (!result.success) {
			if (result.requiresApiKey) {
				// Prompt for API key instead of showing error
				return {
					type: 'prompt_key',
					message: `Please enter your ${provider.toUpperCase()} API key:`,
					data: {
						provider,
						model,
						envVar: result.envVar,
					},
				};
			}
			return {
				type: 'error',
				message: result.message,
			};
		}

		return {
			type: 'success',
			message: `✅ ${result.message}`,
			data: {llmConfig: this.llmService.getCurrentConfig()},
		};
	}

	private handleListModels(args: string[]): CommandResult {
		const currentConfig = this.llmService.getCurrentConfig();

		if (args.length === 0) {
			let modelList = '📋 Available models by provider:\n\n';
			const availableModels = this.llmService.getAvailableModels() as Record<
				string,
				string[]
			>;

			Object.entries(availableModels).forEach(([provider, models]) => {
				modelList += `🔸 ${provider}:\n`;
				models.forEach(model => {
					const current =
						provider === currentConfig?.provider &&
						model === currentConfig?.model
							? ' ← current'
							: '';
					modelList += `   • ${model}${current}\n`;
				});
				modelList += '\n';
			});

			return {
				type: 'info',
				message: modelList.trim(),
			};
		}

		const provider = args[0];
		if (!provider) {
			return {
				type: 'error',
				message: 'Provider is required',
			};
		}

		const availableModels = this.llmService.getAvailableModels() as Record<
			string,
			string[]
		>;

		if (!availableModels[provider]) {
			return {
				type: 'error',
				message: `Unknown provider: ${provider}\nAvailable providers: ${Object.keys(
					availableModels,
				).join(', ')}`,
			};
		}

		let modelList = `📋 Available ${provider} models:\n\n`;
		const models = this.llmService.getAvailableModels(provider) as string[];
		models.forEach(model => {
			const current =
				provider === currentConfig?.provider && model === currentConfig?.model
					? ' ← current'
					: '';
			modelList += `• ${model}${current}\n`;
		});

		modelList += `\n Don't see your model/provider? Submit a PR to add it at https://github.com/mcp-use/mcp-use-cli/`;

		return {
			type: 'info',
			message: modelList.trim(),
		};
	}

	private handleStatus(): CommandResult {
		const availableProviders = this.getAvailableProviders();
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

	private handleConfig(args: string[]): CommandResult {
		if (args.length < 2) {
			return {
				type: 'error',
				message:
					'Usage: /config <setting> <value>\nAvailable settings: temp, tokens',
			};
		}

		const setting = args[0];
		const value = args[1];

		if (!value) {
			return {
				type: 'error',
				message: 'Value is required',
			};
		}

		if (!this.llmService.getCurrentConfig()) {
			return {
				type: 'error',
				message:
					'No model configured. Use /model to select a provider and model first.',
			};
		}

		switch (setting) {
			case 'temp':
			case 'temperature':
				const temp = parseFloat(value);
				if (isNaN(temp)) {
					return {
						type: 'error',
						message: 'Temperature must be a number',
					};
				}
				const tempResult = this.llmService.setTemperature(temp);
				if (!tempResult.success) {
					return {
						type: 'error',
						message: tempResult.message,
					};
				}
				return {
					type: 'success',
					message: `✅ ${tempResult.message}`,
					data: {llmConfig: this.llmService.getCurrentConfig()},
				};

			case 'tokens':
			case 'max-tokens':
				const tokens = parseInt(value);
				if (isNaN(tokens)) {
					return {
						type: 'error',
						message: 'Max tokens must be a number',
					};
				}
				const tokensResult = this.llmService.setMaxTokens(tokens);
				if (!tokensResult.success) {
					return {
						type: 'error',
						message: tokensResult.message,
					};
				}
				return {
					type: 'success',
					message: `✅ ${tokensResult.message}`,
					data: {llmConfig: this.llmService.getCurrentConfig()},
				};

			default:
				return {
					type: 'error',
					message: `Unknown setting: ${setting}\nAvailable settings: temp, tokens`,
				};
		}
	}

	private handleSetKey(args: string[]): CommandResult {
		if (args.length < 2) {
			return {
				type: 'error',
				message:
					'Usage: /setkey <provider> <api_key>\n\nSupported providers: openai, anthropic, google, mistral\n\nExample:\n/setkey openai sk-1234567890abcdef...',
			};
		}

		const provider = args[0]?.toLowerCase();
		const apiKey = args[1];

		if (!provider || !apiKey) {
			return {
				type: 'error',
				message: 'Both provider and API key are required',
			};
		}

		// Validate provider
		const validProviders = ['openai', 'anthropic', 'google', 'mistral'];
		if (!validProviders.includes(provider)) {
			return {
				type: 'error',
				message: `Invalid provider: ${provider}\nSupported providers: ${validProviders.join(
					', ',
				)}`,
			};
		}

		// Check if we should auto-select this provider
		const shouldAutoSelect = !this.llmService.getCurrentConfig();

		// Set the API key
		const result = this.llmService.setApiKey(
			provider,
			apiKey,
			shouldAutoSelect,
		);

		if (!result.success) {
			return {
				type: 'error',
				message: result.message,
			};
		}

		const maskedKey = this.llmService.maskApiKey(apiKey);
		let message = `✅ ${provider} API key set (${maskedKey})`;

		if (result.autoSelected) {
			message += `\n🤖 Auto-selected ${result.autoSelected.provider}/${result.autoSelected.model}`;
		}

		return {
			type: 'success',
			message,
			data: result.autoSelected ? {llmConfig: result.autoSelected} : undefined,
		};
	}

	createLLM(): any {
		return this.llmService.createLLM();
	}

	getCurrentConfig(): any {
		return this.llmService.getCurrentConfig();
	}

	getCurrentStoredConfig(): any {
		// Return a minimal StoredConfig for backward compatibility
		return {
			apiKeys: {},
			mcpServers: this.mcpService.getConfiguredServers(),
			lastModel: this.llmService.getCurrentConfig(),
		};
	}

	getSessionServers(): Record<string, any> {
		return this.mcpService.getSessionServers();
	}

	private handleListTools(): CommandResult {
		return {
			type: 'info',
			message:
				'🔧 Checking available MCP tools...\n\nThis command will show tools available from connected MCP servers.\nNote: This requires the MCP service to provide tool listing functionality.',
			data: {checkTools: true},
		};
	}

	private handleTestServer(args: string[]): CommandResult {
		if (args.length === 0) {
			const configuredServers = Object.keys(
				this.mcpService.getConfiguredServers(),
			);
			if (configuredServers.length === 0) {
				return {
					type: 'error',
					message:
						'No servers configured to test.\n\nUsage: /test-server <server_name>\n\nUse /server add to configure servers first.',
				};
			}
			return {
				type: 'info',
				message: `Usage: /test-server <server_name>\n\nConfigured servers: ${configuredServers.join(
					', ',
				)}\n\nThis command will test if the server package can be started manually.`,
			};
		}

		const serverName = args[0];
		if (!serverName) {
			return {
				type: 'error',
				message:
					'Server name is required.\n\nUsage: /test-server <server_name>',
			};
		}

		const result = this.mcpService.getServerTestCommand(serverName);
		if (!result.success) {
			return {
				type: 'error',
				message: result.message!,
			};
		}

		return {
			type: 'info',
			message: `🧪 Testing server "${serverName}"...\n\nCommand: ${result.command}\n\n⚠️ Note: This will attempt to run the server command manually.\nCheck the console for output and errors.\n\n💡 Try running this command manually in your terminal:\n${result.command}`,
			data: {testServer: true, serverName, command: result.command},
		};
	}

	isCommand(input: string): boolean {
		return input.trim().startsWith('/');
	}

	private handleClearKeys(): CommandResult {
		this.llmService.clearApiKeys();

		return {
			type: 'success',
			message:
				'✅ All API keys cleared from storage.\n\nUse /setkey or /model to set up a new provider.',
			data: {llmConfig: null},
		};
	}

	// Method to handle server configuration input
	handleServerConfigInput(
		input: string,
		step: string,
		serverConfig?: any,
	): CommandResult {
		const config = serverConfig || {};

		switch (step) {
			case 'name_or_json':
				// Check if input looks like JSON
				const trimmedInput = input.trim();
				if (
					trimmedInput.startsWith('{') &&
					trimmedInput.includes('mcpServers')
				) {
					const result = this.mcpService.addServerFromJSON(trimmedInput);
					if (!result.success) {
						return {
							type: 'error',
							message: result.message,
						};
					}

					return {
						type: 'success',
						message: `✅ ${result.message}\n\n🔄 Agent will be reinitialized with these servers - attempting to establish connections...\nUse /tools to verify the server tools are available.`,
						data: result.data,
					};
				}

				// Not JSON, treat as server name for interactive setup
				const validation = this.mcpService.validateServerName(trimmedInput);
				if (!validation.valid) {
					return {
						type: 'error',
						message: validation.message!,
					};
				}

				config.name = trimmedInput;
				return {
					type: 'prompt_server_config',
					message: `Server name: ${config.name}\n\nEnter the command to run this server (e.g., "npx", "node", "python"):`,
					data: {step: 'command', config},
				};

			case 'name':
				const nameValidation = this.mcpService.validateServerName(input.trim());
				if (!nameValidation.valid) {
					return {
						type: 'error',
						message: nameValidation.message!,
					};
				}

				config.name = input.trim();
				return {
					type: 'prompt_server_config',
					message: `Server name: ${config.name}\n\nEnter the command to run this server (e.g., "npx", "node", "python"):`,
					data: {step: 'command', config},
				};

			case 'command':
				if (!input.trim()) {
					return {
						type: 'error',
						message: 'Command cannot be empty.',
					};
				}

				config.command = input.trim();
				return {
					type: 'prompt_server_config',
					message: `Server name: ${config.name}\nCommand: ${config.command}\n\nEnter arguments (space-separated, or press Enter for none):\nExample: "-y @modelcontextprotocol/server-filesystem /tmp"`,
					data: {step: 'args', config},
				};

			case 'args':
				config.args = input.trim() ? input.trim().split(/\s+/) : [];
				return {
					type: 'prompt_server_config',
					message: `Server name: ${config.name}\nCommand: ${
						config.command
					}\nArgs: ${
						config.args.length > 0 ? config.args.join(' ') : 'none'
					}\n\nEnter environment variables (KEY=VALUE format, one per line, or press Enter for none):\nExample: "DEBUG=1" or press Enter to skip:`,
					data: {step: 'env', config},
				};

			case 'env':
				config.env = this.mcpService.parseEnvironmentVariables(input);

				return {
					type: 'prompt_server_config',
					message: `Server Configuration Summary:\n\nName: ${
						config.name
					}\nCommand: ${config.command}\nArgs: ${
						config.args.length > 0 ? config.args.join(' ') : 'none'
					}\nEnv: ${
						Object.keys(config.env).length > 0
							? Object.entries(config.env)
									.map(([k, v]) => `${k}=${v}`)
									.join(', ')
							: 'none'
					}\n\nConfirm to add this server? (y/n):`,
					data: {step: 'confirm', config},
				};

			case 'confirm':
				if (
					input.trim().toLowerCase() === 'y' ||
					input.trim().toLowerCase() === 'yes'
				) {
					const serverConfig = {
						command: config.command,
						args: config.args,
						env: config.env,
					};

					const result = this.mcpService.addServer(config.name, serverConfig);
					if (!result.success) {
						return {
							type: 'error',
							message: result.message,
						};
					}

					return {
						type: 'success',
						message: `✅ ${result.message}\n\n🔄 Agent will be reinitialized with this server - attempting to establish connection...\nUse /tools to verify the server tools are available.`,
						data: result.data,
					};
				} else if (
					input.trim().toLowerCase() === 'n' ||
					input.trim().toLowerCase() === 'no'
				) {
					return {
						type: 'info',
						message: 'Server configuration cancelled.',
					};
				} else {
					return {
						type: 'error',
						message: 'Please enter "y" for yes or "n" for no.',
					};
				}

			default:
				return {
					type: 'error',
					message: 'Invalid server configuration step.',
				};
		}
	}

	private handleServer(args: string[]): CommandResult {
		if (args.length === 0) {
			return {
				type: 'info',
				message:
					'Server management commands:\n\n/server add              - Configure a new server (stored but not connected)\n/server connect <name>   - Connect to a configured server by name\n/server disconnect <name> - Disconnect from a connected server\n/servers                 - List configured servers and connection status\n\nUse /server <command> for specific help.',
			};
		}

		if (args[0] === 'add') {
			return {
				type: 'prompt_server_config',
				message:
					'Let\'s configure a new MCP server!\n\nYou can either:\n1. Enter a server name for interactive setup\n2. Paste a complete JSON configuration\n\nExample JSON:\n{\n  "mcpServers": {\n    "myserver": {\n      "command": "npx",\n      "args": ["-y", "@example/server"]\n    }\n  }\n}\n\nEnter server name or paste JSON:',
				data: {step: 'name_or_json'},
			};
		}

		if (args[0] === 'connect') {
			if (args.length < 2) {
				const configuredServers = Object.keys(
					this.mcpService.getConfiguredServers(),
				);
				if (configuredServers.length === 0) {
					return {
						type: 'error',
						message:
							'No servers configured. Use /server add to configure servers first.\n\nUsage: /server connect <server_name>',
					};
				}
				return {
					type: 'error',
					message: `Usage: /server connect <server_name>\n\nConfigured servers: ${configuredServers.join(
						', ',
					)}`,
				};
			}

			const serverName = args[1];
			if (!serverName) {
				return {
					type: 'error',
					message:
						'Server name is required.\n\nUsage: /server connect <server_name>',
				};
			}
			return this.handleConnectServer(serverName);
		}

		if (args[0] === 'disconnect') {
			if (args.length < 2) {
				const connectedServers = Object.keys(
					this.mcpService.getSessionServers(),
				);
				if (connectedServers.length === 0) {
					return {
						type: 'info',
						message:
							'No servers currently connected.\n\nUsage: /server disconnect <server_name>',
					};
				}
				return {
					type: 'error',
					message: `Usage: /server disconnect <server_name>\n\nConnected servers: ${connectedServers.join(
						', ',
					)}`,
				};
			}

			const serverName = args[1];
			if (!serverName) {
				return {
					type: 'error',
					message:
						'Server name is required.\n\nUsage: /server disconnect <server_name>',
				};
			}
			return this.handleDisconnectServer(serverName);
		}

		return {
			type: 'error',
			message:
				'Usage: /server <command>\n\nCommands:\n  add              - Configure server\n  connect <name>   - Connect to server\n  disconnect <name> - Disconnect server\n\nExample: /server connect airbnb',
		};
	}

	private handleListServers(): CommandResult {
		const serverStatus = this.mcpService.getServerStatus();

		let serverList = '📋 MCP Server Status:\n\n';
		if (serverStatus.length === 0) {
			serverList +=
				'No custom servers configured.\n\nUse /server add to configure servers, then /server connect <name> to connect.';
		} else {
			for (const server of serverStatus) {
				const status = server.isConnected ? '🟢 Connected' : '🔴 Disconnected';
				const action = server.isConnected
					? '/server disconnect'
					: '/server connect';

				serverList += `🔸 ${server.name}:\n`;
				serverList += `   Status: ${status}\n`;
				serverList += `   Command: ${server.config.command}\n`;
				if (server.config.args && server.config.args.length > 0) {
					serverList += `   Args: ${server.config.args.join(' ')}\n`;
				}
				if (server.config.env && Object.keys(server.config.env).length > 0) {
					serverList += `   Env: ${Object.entries(server.config.env)
						.map(([k, v]) => `${k}=${v}`)
						.join(', ')}\n`;
				}
				serverList += `   Action: ${action} ${server.name}\n\n`;
			}
		}

		return {
			type: 'info',
			message: serverList.trim(),
		};
	}

	private handleConnectServer(serverName: string): CommandResult {
		const result = this.mcpService.connectServer(serverName);
		if (!result.success) {
			return {
				type: 'error',
				message: result.message,
			};
		}

		return {
			type: 'success',
			message: `✅ ${result.message}\n\n🔄 Agent will be reinitialized with this server - attempting to establish connection...\nUse /tools to verify the server tools are available.`,
			data: result.data,
		};
	}

	private handleDisconnectServer(serverName: string): CommandResult {
		const result = this.mcpService.disconnectServer(serverName);
		if (!result.success) {
			return {
				type: 'error',
				message: result.message,
			};
		}

		return {
			type: 'success',
			message: `✅ ${result.message}\n\n🔄 Agent will be reinitialized without this server.`,
			data: result.data,
		};
	}

	// Method to handle API key input and complete model selection
	handleApiKeyInput(
		apiKey: string,
		provider: string,
		model: string,
	): CommandResult {
		// Set the API key
		const keyResult = this.llmService.setApiKey(provider, apiKey, false);
		if (!keyResult.success) {
			return {
				type: 'error',
				message: keyResult.message,
			};
		}

		// Now set the model
		const modelResult = this.llmService.setModel(provider, model);
		if (!modelResult.success) {
			return {
				type: 'error',
				message: modelResult.message,
			};
		}

		const maskedKey = this.llmService.maskApiKey(apiKey);
		return {
			type: 'success',
			message: `✅ ${provider} API key set (${maskedKey})\n🤖 Switched to ${provider}/${model}`,
			data: {llmConfig: this.llmService.getCurrentConfig()},
		};
	}

	private handleLogs(args: string[]): CommandResult {
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

	private handleClearLogs(): CommandResult {
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

	private handleHistory(): CommandResult {
		return {
			type: 'info',
			message: `📜 Input History Navigation:\n\n🔼 Arrow Up   - Navigate to previous inputs\n🔽 Arrow Down - Navigate to newer inputs\n\n💡 Tips:\n• Your input history is automatically saved during the session\n• Use ↑ to recall previous commands and messages\n• Use ↓ to navigate back to newer inputs\n• History is reset when you restart the CLI\n\n🎯 Try it now: Press the up arrow key in the input box!`,
		};
	}
}
