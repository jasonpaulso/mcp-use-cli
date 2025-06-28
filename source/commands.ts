import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatMistralAI } from '@langchain/mistralai';
import { SecureStorage, StoredConfig } from './storage.js';
import { Logger } from './logger.js';

export interface LLMConfig {
	provider: 'openai' | 'anthropic' | 'google' | 'mistral';
	model: string;
	temperature?: number;
	maxTokens?: number;
}

export interface CommandResult {
	type: 'success' | 'error' | 'info' | 'prompt_key' | 'prompt_server_config';
	message: string;
	data?: any;
}

export class CommandHandler {
	private currentLLMConfig: LLMConfig | null = null;
	private sessionApiKeys: Record<string, string> = {};
	private persistentConfig: StoredConfig;
	private sessionServers: Record<string, { command: string; args?: string[]; env?: Record<string, string>; }> = {};

	private availableModels = {
		openai: [
			'gpt-4o',
			'gpt-4o-mini',
			'gpt-4-turbo',
			'gpt-4',
			'gpt-3.5-turbo'
		],
		anthropic: [
			'claude-3-5-sonnet-20241022',
			'claude-3-5-haiku-20241022',
			'claude-3-opus-20240229',
			'claude-3-sonnet-20240229',
			'claude-3-haiku-20240307'
		],
		google: [
			'gemini-1.5-pro',
			'gemini-1.5-flash',
			'gemini-pro'
		],
		mistral: [
			'mistral-large-latest',
			'mistral-medium-latest',
			'mistral-small-latest'
		]
	};

	constructor() {
		// Load persistent config
		this.persistentConfig = SecureStorage.loadConfig();

		// Auto-detect available provider and set default
		this.initializeDefaultProvider();
	}

	private initializeDefaultProvider() {
		// First, try to load the last used model from persistent config
		if (this.persistentConfig.lastModel) {
			const lastModel = this.persistentConfig.lastModel;
			const envVar = {
				openai: 'OPENAI_API_KEY',
				anthropic: 'ANTHROPIC_API_KEY',
				google: 'GOOGLE_API_KEY',
				mistral: 'MISTRAL_API_KEY'
			}[lastModel.provider];

			// Check if we still have the API key for the last used model
			if (envVar && this.getApiKey(envVar)) {
				this.currentLLMConfig = {
					provider: lastModel.provider as LLMConfig['provider'],
					model: lastModel.model,
					temperature: lastModel.temperature || 0.7,
					maxTokens: lastModel.maxTokens
				};
				return;
			}
		}

		const providers = [
			{ name: 'openai' as const, envVar: 'OPENAI_API_KEY', defaultModel: 'gpt-4o-mini' },
			{ name: 'anthropic' as const, envVar: 'ANTHROPIC_API_KEY', defaultModel: 'claude-3-5-sonnet-20241022' },
			{ name: 'google' as const, envVar: 'GOOGLE_API_KEY', defaultModel: 'gemini-1.5-pro' },
			{ name: 'mistral' as const, envVar: 'MISTRAL_API_KEY', defaultModel: 'mistral-large-latest' }
		];

		// Find first available provider
		for (const provider of providers) {
			if (this.getApiKey(provider.envVar)) {
				this.currentLLMConfig = {
					provider: provider.name,
					model: provider.defaultModel,
					temperature: 0.7
				};
				return;
			}
		}

		// No provider found - leave null, will show setup message
		this.currentLLMConfig = null;
	}

	getAvailableProviders(): string[] {
		const providers = [];
		if (this.getApiKey('OPENAI_API_KEY')) providers.push('openai');
		if (this.getApiKey('ANTHROPIC_API_KEY')) providers.push('anthropic');
		if (this.getApiKey('GOOGLE_API_KEY')) providers.push('google');
		if (this.getApiKey('MISTRAL_API_KEY')) providers.push('mistral');
		return providers;
	}

	private getApiKey(envVar: string): string | undefined {
		// Check session keys first, then persistent storage, then environment variables
		return this.sessionApiKeys[envVar] || this.persistentConfig.apiKeys[envVar] || process.env[envVar];
	}

	isAnyProviderAvailable(): boolean {
		return this.getAvailableProviders().length > 0;
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
					message: `Unknown command: ${command}. Type /help for available commands.`
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
			message: helpText
		};
	}

	private handleModel(args: string[]): CommandResult {
		if (args.length < 2) {
			const availableProviders = this.getAvailableProviders();
			if (availableProviders.length === 0) {
				return {
					type: 'info',
					message: 'Usage: /model <provider> <model>\n\nPopular models to try:\n• /model openai gpt-4o-mini\n• /model anthropic claude-3-5-sonnet-20241022\n• /model google gemini-1.5-pro\n\nThe CLI will prompt for your API key when needed.\nUse /models to see all available options.'
				};
			}
			return {
				type: 'error',
				message: `Usage: /model <provider> <model>\nExample: /model openai gpt-4o\n\nAvailable providers: ${availableProviders.join(', ')}`
			};
		}

		const provider = args[0] as keyof typeof this.availableModels;
		const model = args[1];

		if (!provider || !this.availableModels[provider]) {
			return {
				type: 'error',
				message: `Unknown provider: ${provider}\nAvailable providers: ${Object.keys(this.availableModels).join(', ')}`
			};
		}

		// Check if the provider's API key is available
		const availableProviders = this.getAvailableProviders();
		if (!availableProviders.includes(provider)) {
			const envVarMap = {
				openai: 'OPENAI_API_KEY',
				anthropic: 'ANTHROPIC_API_KEY',
				google: 'GOOGLE_API_KEY',
				mistral: 'MISTRAL_API_KEY'
			};

			// Prompt for API key instead of showing error
			return {
				type: 'prompt_key',
				message: `Please enter your ${provider.toUpperCase()} API key:`,
				data: {
					provider,
					model,
					envVar: envVarMap[provider as keyof typeof envVarMap]
				}
			};
		}

		if (!model || !this.availableModels[provider].includes(model)) {
			return {
				type: 'error',
				message: `Model ${model} not available for ${provider}\nUse /models ${provider} to see available models`
			};
		}

		this.currentLLMConfig = {
			provider,
			model,
			temperature: this.currentLLMConfig?.temperature || 0.7,
			maxTokens: this.currentLLMConfig?.maxTokens
		};

		// Save the current model to persistent storage
		this.persistentConfig.lastModel = this.currentLLMConfig;
		SecureStorage.saveConfig(this.persistentConfig);

		return {
			type: 'success',
			message: `✅ Switched to ${provider} ${model}`,
			data: { llmConfig: this.currentLLMConfig }
		};
	}

	private handleListModels(args: string[]): CommandResult {
		if (args.length === 0) {
			let modelList = '📋 Available models by provider:\n\n';

			Object.entries(this.availableModels).forEach(([provider, models]) => {
				modelList += `🔸 ${provider}:\n`;
				models.forEach(model => {
					const current = provider === this.currentLLMConfig?.provider && model === this.currentLLMConfig?.model ? ' ← current' : '';
					modelList += `   • ${model}${current}\n`;
				});
				modelList += '\n';
			});

			return {
				type: 'info',
				message: modelList.trim()
			};
		}

		const provider = args[0] as keyof typeof this.availableModels;

		if (!this.availableModels[provider]) {
			return {
				type: 'error',
				message: `Unknown provider: ${provider}\nAvailable providers: ${Object.keys(this.availableModels).join(', ')}`
			};
		}

		let modelList = `📋 Available ${provider} models:\n\n`;
		this.availableModels[provider].forEach(model => {
			const current = provider === this.currentLLMConfig?.provider && model === this.currentLLMConfig?.model ? ' ← current' : '';
			modelList += `• ${model}${current}\n`;
		});

		modelList += `\n Don't see your model/provider? Submit a PR to add it at https://github.com/mcp-use/mcp-use-cli/`;

		return {
			type: 'info',
			message: modelList.trim()
		};
	}

	private handleStatus(): CommandResult {
		const availableProviders = this.getAvailableProviders();

		let statusText = '🤖 Current Configuration:\n\n';

		// API Keys status
		statusText += '🔑 API Keys:\n';
		const allProviders = ['openai', 'anthropic', 'google', 'mistral'] as const;
		allProviders.forEach(provider => {
			const envVarMap = {
				openai: 'OPENAI_API_KEY',
				anthropic: 'ANTHROPIC_API_KEY',
				google: 'GOOGLE_API_KEY',
				mistral: 'MISTRAL_API_KEY'
			} as const;

			const envVar = envVarMap[provider];
			const hasEnvKey = !!process.env[envVar];
			const hasSessionKey = !!this.sessionApiKeys[envVar];

			const hasPersistentKey = !!this.persistentConfig.apiKeys[envVar];

			if (hasSessionKey) {
				const key = this.sessionApiKeys[envVar];
				if (key) {
					const maskedKey = this.maskApiKey(key);
					statusText += `  • ${provider}: ${maskedKey} (session)\n`;
				}
			} else if (hasPersistentKey) {
				const key = this.persistentConfig.apiKeys[envVar];
				if (key) {
					const maskedKey = this.maskApiKey(key);
					statusText += `  • ${provider}: ${maskedKey} (stored)\n`;
				}
			} else if (hasEnvKey) {
				const key = process.env[envVar];
				if (key) {
					const maskedKey = this.maskApiKey(key);
					statusText += `  • ${provider}: ${maskedKey} (env)\n`;
				}
			} else {
				statusText += `  • ${provider}: ❌ not set\n`;
			}
		});

		statusText += '\n';

		// Current model
		if (!this.currentLLMConfig) {
			if (availableProviders.length === 0) {
				statusText += '⚠️ No model selected\n';
				statusText += '\nChoose a model to get started:\n';
				statusText += '• /model openai gpt-4o-mini\n';
				statusText += '• /model anthropic claude-3-5-sonnet-20241022\n';
				statusText += '• /model google gemini-1.5-pro\n';
				statusText += '\nThe CLI will help you set up API keys when needed.';
			} else {
				statusText += '⚠️ No model selected\n';
				statusText += `\nAvailable providers: ${availableProviders.join(', ')}\n`;
				statusText += 'Use /model <provider> <model> to get started';
			}
		} else {
			const config = this.currentLLMConfig;
			statusText += `🎯 Active Model:\n`;
			statusText += `  Provider: ${config.provider}\n`;
			statusText += `  Model: ${config.model}\n`;
			statusText += `  Temperature: ${config.temperature || 0.7}\n`;
			statusText += `  Max Tokens: ${config.maxTokens || 'default'}\n`;
			statusText += '\nUse /model to switch models or /config to adjust settings';
		}

		return {
			type: 'info',
			message: statusText
		};
	}

	private handleConfig(args: string[]): CommandResult {
		if (args.length < 2) {
			return {
				type: 'error',
				message: 'Usage: /config <setting> <value>\nAvailable settings: temp, tokens'
			};
		}

		const setting = args[0];
		const value = args[1];

		if (!value) {
			return {
				type: 'error',
				message: 'Value is required'
			};
		}

		if (!this.currentLLMConfig) {
			return {
				type: 'error',
				message: 'No model configured. Use /model to select a provider and model first.'
			};
		}

		switch (setting) {
			case 'temp':
			case 'temperature':
				const temp = parseFloat(value);
				if (isNaN(temp) || temp < 0 || temp > 2) {
					return {
						type: 'error',
						message: 'Temperature must be a number between 0.0 and 2.0'
					};
				}
				this.currentLLMConfig.temperature = temp;
				return {
					type: 'success',
					message: `✅ Temperature set to ${temp}`,
					data: { llmConfig: this.currentLLMConfig }
				};

			case 'tokens':
			case 'max-tokens':
				const tokens = parseInt(value);
				if (isNaN(tokens) || tokens < 1) {
					return {
						type: 'error',
						message: 'Max tokens must be a positive integer'
					};
				}
				this.currentLLMConfig.maxTokens = tokens;
				return {
					type: 'success',
					message: `✅ Max tokens set to ${tokens}`,
					data: { llmConfig: this.currentLLMConfig }
				};

			default:
				return {
					type: 'error',
					message: `Unknown setting: ${setting}\nAvailable settings: temp, tokens`
				};
		}
	}

	private handleSetKey(args: string[]): CommandResult {
		if (args.length < 2) {
			return {
				type: 'error',
				message: 'Usage: /setkey <provider> <api_key>\n\nSupported providers: openai, anthropic, google, mistral\n\nExample:\n/setkey openai sk-1234567890abcdef...'
			};
		}

		const provider = args[0]?.toLowerCase();
		const apiKey = args[1];

		if (!provider || !apiKey) {
			return {
				type: 'error',
				message: 'Both provider and API key are required'
			};
		}

		// Validate provider
		const validProviders = ['openai', 'anthropic', 'google', 'mistral'];
		if (!validProviders.includes(provider)) {
			return {
				type: 'error',
				message: `Invalid provider: ${provider}\nSupported providers: ${validProviders.join(', ')}`
			};
		}

		// Basic API key validation
		const validationResult = this.validateApiKey(provider, apiKey);
		if (!validationResult.valid) {
			return {
				type: 'error',
				message: validationResult.message
			};
		}

		// Map provider to environment variable name
		const envVarMap = {
			openai: 'OPENAI_API_KEY',
			anthropic: 'ANTHROPIC_API_KEY',
			google: 'GOOGLE_API_KEY',
			mistral: 'MISTRAL_API_KEY'
		};

		const envVar = envVarMap[provider as keyof typeof envVarMap];

		// Store the API key in persistent storage
		this.persistentConfig.apiKeys[envVar] = apiKey;
		SecureStorage.saveConfig(this.persistentConfig);

		// Check if we can auto-select this provider
		const shouldAutoSelect = !this.currentLLMConfig;
		if (shouldAutoSelect) {
			const defaultModels = {
				openai: 'gpt-4o-mini',
				anthropic: 'claude-3-5-sonnet-20241022',
				google: 'gemini-1.5-pro',
				mistral: 'mistral-large-latest'
			};

			this.currentLLMConfig = {
				provider: provider as any,
				model: defaultModels[provider as keyof typeof defaultModels],
				temperature: 0.7
			};
		}

		const maskedKey = this.maskApiKey(apiKey);
		let message = `✅ ${provider} API key set (${maskedKey})`;

		if (shouldAutoSelect) {
			message += `\n🤖 Auto-selected ${this.currentLLMConfig!.provider}/${this.currentLLMConfig!.model}`;
		}

		return {
			type: 'success',
			message,
			data: shouldAutoSelect ? { llmConfig: this.currentLLMConfig } : undefined
		};
	}

	private validateApiKey(provider: string, apiKey: string): { valid: boolean; message: string } {
		if (!apiKey || apiKey.trim().length === 0) {
			return { valid: false, message: 'API key cannot be empty' };
		}

		// Basic format validation for each provider
		switch (provider) {
			case 'openai':
				if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
					return { valid: false, message: 'OpenAI API keys should start with "sk-" and be at least 20 characters long' };
				}
				break;
			case 'anthropic':
				if (!apiKey.startsWith('ant_') && !apiKey.startsWith('sk-ant-') || apiKey.length < 20) {
					return { valid: false, message: 'Anthropic API keys should start with "ant_" or "sk-ant-" and be at least 20 characters long' };
				}
				break;
			case 'google':
				if (apiKey.length < 20) {
					return { valid: false, message: 'Google API keys should be at least 20 characters long' };
				}
				break;
			case 'mistral':
				if (apiKey.length < 20) {
					return { valid: false, message: 'Mistral API keys should be at least 20 characters long' };
				}
				break;
		}

		return { valid: true, message: '' };
	}

	private maskApiKey(apiKey: string): string {
		if (apiKey.length <= 8) {
			return '*'.repeat(apiKey.length);
		}
		const start = apiKey.substring(0, 4);
		const end = apiKey.substring(apiKey.length - 4);
		const middle = '*'.repeat(Math.min(12, apiKey.length - 8));
		return `${start}${middle}${end}`;
	}

	createLLM(): any {
		if (!this.currentLLMConfig) {
			throw new Error('No LLM configured. Use /model command to select a provider and model.');
		}

		const config = this.currentLLMConfig;
		const baseConfig = {
			temperature: config.temperature || 0.7,
			maxTokens: config.maxTokens
		};

		switch (config.provider) {
			case 'openai':
				const openaiKey = this.getApiKey('OPENAI_API_KEY');
				if (!openaiKey) {
					throw new Error('OPENAI_API_KEY is required for OpenAI models. Use /setkey openai <your-key>');
				}
				return new ChatOpenAI({
					modelName: config.model,
					openAIApiKey: openaiKey,
					...baseConfig
				});

			case 'anthropic':
				const anthropicKey = this.getApiKey('ANTHROPIC_API_KEY');
				if (!anthropicKey) {
					throw new Error('ANTHROPIC_API_KEY is required for Anthropic models. Use /setkey anthropic <your-key>');
				}
				return new ChatAnthropic({
					modelName: config.model,
					anthropicApiKey: anthropicKey,
					...baseConfig
				}) as any;

			case 'google':
				const googleKey = this.getApiKey('GOOGLE_API_KEY');
				if (!googleKey) {
					throw new Error('GOOGLE_API_KEY is required for Google models. Use /setkey google <your-key>');
				}
				return new ChatGoogleGenerativeAI({
					model: config.model,
					apiKey: googleKey,
					...baseConfig
				}) as any;

			case 'mistral':
				const mistralKey = this.getApiKey('MISTRAL_API_KEY');
				if (!mistralKey) {
					throw new Error('MISTRAL_API_KEY is required for Mistral models. Use /setkey mistral <your-key>');
				}
				return new ChatMistralAI({
					modelName: config.model,
					apiKey: mistralKey,
					...baseConfig
				}) as any;

			default:
				throw new Error(`Unsupported provider: ${config.provider}`);
		}
	}

	getCurrentConfig(): LLMConfig | null {
		return this.currentLLMConfig ? { ...this.currentLLMConfig } : null;
	}

	getCurrentStoredConfig(): StoredConfig {
		return this.persistentConfig;
	}

	getSessionServers(): Record<string, { command: string; args?: string[]; env?: Record<string, string>; }> {
		return this.sessionServers;
	}

	private handleListTools(): CommandResult {
		return {
			type: 'info',
			message: '🔧 Checking available MCP tools...\n\nThis command will show tools available from connected MCP servers.\nNote: This requires the MCP service to provide tool listing functionality.',
			data: { checkTools: true }
		};
	}

	private handleTestServer(args: string[]): CommandResult {
		if (args.length === 0) {
			const configuredServers = Object.keys(this.persistentConfig.mcpServers || {});
			if (configuredServers.length === 0) {
				return {
					type: 'error',
					message: 'No servers configured to test.\n\nUsage: /test-server <server_name>\n\nUse /server add to configure servers first.'
				};
			}
			return {
				type: 'info',
				message: `Usage: /test-server <server_name>\n\nConfigured servers: ${configuredServers.join(', ')}\n\nThis command will test if the server package can be started manually.`
			};
		}

		const serverName = args[0];
		if (!serverName) {
			return {
				type: 'error',
				message: 'Server name is required.\n\nUsage: /test-server <server_name>'
			};
		}

		const serverConfig = this.persistentConfig.mcpServers?.[serverName];

		if (!serverConfig) {
			const configuredServers = Object.keys(this.persistentConfig.mcpServers || {});
			return {
				type: 'error',
				message: `Server "${serverName}" is not configured.\n\nConfigured servers: ${configuredServers.length > 0 ? configuredServers.join(', ') : 'none'}`
			};
		}

		const command = serverConfig.command;
		const args_str = serverConfig.args ? serverConfig.args.join(' ') : '';
		const full_command = `${command} ${args_str}`.trim();

		return {
			type: 'info',
			message: `🧪 Testing server "${serverName}"...\n\nCommand: ${full_command}\n\n⚠️ Note: This will attempt to run the server command manually.\nCheck the console for output and errors.\n\n💡 Try running this command manually in your terminal:\n${full_command}`,
			data: { testServer: true, serverName, command: full_command }
		};
	}

	isCommand(input: string): boolean {
		return input.trim().startsWith('/');
	}

	private handleClearKeys(): CommandResult {
		// Clear both session and persistent keys
		this.sessionApiKeys = {};
		this.persistentConfig.apiKeys = {};
		this.persistentConfig.lastModel = undefined;

		// Clear the current LLM config since we have no keys
		this.currentLLMConfig = null;

		// Save the cleared config
		SecureStorage.saveConfig(this.persistentConfig);

		return {
			type: 'success',
			message: '✅ All API keys cleared from storage.\n\nUse /setkey or /model to set up a new provider.',
			data: { llmConfig: null }
		};
	}

	// Method to handle server configuration input
	handleServerConfigInput(input: string, step: string, serverConfig?: any): CommandResult {
		const config = serverConfig || {};

		switch (step) {
			case 'name_or_json':
				// Check if input looks like JSON
				const trimmedInput = input.trim();
				if (trimmedInput.startsWith('{') && trimmedInput.includes('mcpServers')) {
					try {
						const parsedConfig = JSON.parse(trimmedInput);

						// Validate JSON structure
						if (!parsedConfig.mcpServers || typeof parsedConfig.mcpServers !== 'object') {
							return {
								type: 'error',
								message: 'Invalid JSON format. Expected format:\n{\n  "mcpServers": {\n    "servername": {\n      "command": "...",\n      "args": [...]\n    }\n  }\n}'
							};
						}

						const servers = parsedConfig.mcpServers;
						const serverNames = Object.keys(servers);

						if (serverNames.length === 0) {
							return {
								type: 'error',
								message: 'No servers found in JSON configuration.'
							};
						}

						// Check for conflicts with existing servers
						const existingServers = this.persistentConfig.mcpServers || {};
						const conflicts = serverNames.filter(name => existingServers[name]);

						if (conflicts.length > 0) {
							return {
								type: 'error',
								message: `Server(s) already exist: ${conflicts.join(', ')}. Please use different names.`
							};
						}

						// Validate each server config
						for (const [name, serverConfig] of Object.entries(servers)) {
							const server = serverConfig as any;
							if (!server.command || typeof server.command !== 'string') {
								return {
									type: 'error',
									message: `Server "${name}" missing required "command" field.`
								};
							}
						}

						// All validation passed, save the servers
						if (!this.persistentConfig.mcpServers) {
							this.persistentConfig.mcpServers = {};
						}

						// Add all servers from JSON
						Object.assign(this.persistentConfig.mcpServers, servers);
						SecureStorage.saveConfig(this.persistentConfig);

						// Auto-connect all newly configured servers
						Object.assign(this.sessionServers, servers);

						const addedCount = serverNames.length;
						const serverList = serverNames.map(name => `• ${name}`).join('\n');

						return {
							type: 'success',
							message: `✅ Configured and connected ${addedCount} server(s)!\n\n${serverList}\n\n🔄 Agent will be reinitialized with these servers - attempting to establish connections...\nUse /tools to verify the server tools are available.`,
							data: { serversAdded: true, serverConnected: true, serverNames, reinitializeAgent: true }
						};

					} catch (error) {
						return {
							type: 'error',
							message: `Invalid JSON format: ${error instanceof Error ? error.message : 'Parse error'}\n\nPlease check your JSON syntax and try again.`
						};
					}
				}

				// Not JSON, treat as server name for interactive setup
				if (!trimmedInput) {
					return {
						type: 'error',
						message: 'Server name cannot be empty.'
					};
				}

				// Check if server name already exists
				if (this.persistentConfig.mcpServers?.[trimmedInput]) {
					return {
						type: 'error',
						message: `Server "${trimmedInput}" already exists. Use a different name.`
					};
				}

				config.name = trimmedInput;
				return {
					type: 'prompt_server_config',
					message: `Server name: ${config.name}\n\nEnter the command to run this server (e.g., "npx", "node", "python"):`,
					data: { step: 'command', config }
				};

			case 'name':
				if (!input.trim()) {
					return {
						type: 'error',
						message: 'Server name cannot be empty.'
					};
				}

				// Check if server name already exists
				if (this.persistentConfig.mcpServers?.[input.trim()]) {
					return {
						type: 'error',
						message: `Server "${input.trim()}" already exists. Use a different name.`
					};
				}

				config.name = input.trim();
				return {
					type: 'prompt_server_config',
					message: `Server name: ${config.name}\n\nEnter the command to run this server (e.g., "npx", "node", "python"):`,
					data: { step: 'command', config }
				};

			case 'command':
				if (!input.trim()) {
					return {
						type: 'error',
						message: 'Command cannot be empty.'
					};
				}

				config.command = input.trim();
				return {
					type: 'prompt_server_config',
					message: `Server name: ${config.name}\nCommand: ${config.command}\n\nEnter arguments (space-separated, or press Enter for none):\nExample: "-y @modelcontextprotocol/server-filesystem /tmp"`,
					data: { step: 'args', config }
				};

			case 'args':
				config.args = input.trim() ? input.trim().split(/\s+/) : [];
				return {
					type: 'prompt_server_config',
					message: `Server name: ${config.name}\nCommand: ${config.command}\nArgs: ${config.args.length > 0 ? config.args.join(' ') : 'none'}\n\nEnter environment variables (KEY=VALUE format, one per line, or press Enter for none):\nExample: "DEBUG=1" or press Enter to skip:`,
					data: { step: 'env', config }
				};

			case 'env':
				config.env = {};
				if (input.trim()) {
					const envLines = input.trim().split('\n');
					for (const line of envLines) {
						const [key, ...valueParts] = line.split('=');
						if (key && valueParts.length > 0) {
							config.env[key.trim()] = valueParts.join('=').trim();
						}
					}
				}

				return {
					type: 'prompt_server_config',
					message: `Server Configuration Summary:\n\nName: ${config.name}\nCommand: ${config.command}\nArgs: ${config.args.length > 0 ? config.args.join(' ') : 'none'}\nEnv: ${Object.keys(config.env).length > 0 ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`).join(', ') : 'none'}\n\nConfirm to add this server? (y/n):`,
					data: { step: 'confirm', config }
				};

			case 'confirm':
				if (input.trim().toLowerCase() === 'y' || input.trim().toLowerCase() === 'yes') {
					const serverConfig = {
						command: config.command,
						args: config.args,
						env: config.env
					};

					// Add server to persistent configuration (servers are configured but not automatically connected)
					if (!this.persistentConfig.mcpServers) {
						this.persistentConfig.mcpServers = {};
					}

					this.persistentConfig.mcpServers[config.name] = serverConfig;

					// Save configuration
					SecureStorage.saveConfig(this.persistentConfig);

					// Auto-connect the newly configured server
					this.sessionServers[config.name] = serverConfig;

					return {
						type: 'success',
						message: `✅ Server "${config.name}" configured and connected!\n\n🔄 Agent will be reinitialized with this server - attempting to establish connection...\nUse /tools to verify the server tools are available.`,
						data: { serverAdded: true, serverConnected: true, serverName: config.name, reinitializeAgent: true }
					};
				} else if (input.trim().toLowerCase() === 'n' || input.trim().toLowerCase() === 'no') {
					return {
						type: 'info',
						message: 'Server configuration cancelled.'
					};
				} else {
					return {
						type: 'error',
						message: 'Please enter "y" for yes or "n" for no.'
					};
				}

			default:
				return {
					type: 'error',
					message: 'Invalid server configuration step.'
				};
		}
	}

	private handleServer(args: string[]): CommandResult {
		if (args.length === 0) {
			return {
				type: 'info',
				message: 'Server management commands:\n\n/server add              - Configure a new server (stored but not connected)\n/server connect <name>   - Connect to a configured server by name\n/server disconnect <name> - Disconnect from a connected server\n/servers                 - List configured servers and connection status\n\nUse /server <command> for specific help.'
			};
		}

		if (args[0] === 'add') {
			return {
				type: 'prompt_server_config',
				message: 'Let\'s configure a new MCP server!\n\nYou can either:\n1. Enter a server name for interactive setup\n2. Paste a complete JSON configuration\n\nExample JSON:\n{\n  "mcpServers": {\n    "myserver": {\n      "command": "npx",\n      "args": ["-y", "@example/server"]\n    }\n  }\n}\n\nEnter server name or paste JSON:',
				data: { step: 'name_or_json' }
			};
		}

		if (args[0] === 'connect') {
			if (args.length < 2) {
				const configuredServers = Object.keys({ ...this.persistentConfig.mcpServers });
				if (configuredServers.length === 0) {
					return {
						type: 'error',
						message: 'No servers configured. Use /server add to configure servers first.\n\nUsage: /server connect <server_name>'
					};
				}
				return {
					type: 'error',
					message: `Usage: /server connect <server_name>\n\nConfigured servers: ${configuredServers.join(', ')}`
				};
			}

			const serverName = args[1];
			if (!serverName) {
				return {
					type: 'error',
					message: 'Server name is required.\n\nUsage: /server connect <server_name>'
				};
			}
			return this.handleConnectServer(serverName);
		}

		if (args[0] === 'disconnect') {
			if (args.length < 2) {
				const connectedServers = Object.keys(this.sessionServers);
				if (connectedServers.length === 0) {
					return {
						type: 'info',
						message: 'No servers currently connected.\n\nUsage: /server disconnect <server_name>'
					};
				}
				return {
					type: 'error',
					message: `Usage: /server disconnect <server_name>\n\nConnected servers: ${connectedServers.join(', ')}`
				};
			}

			const serverName = args[1];
			if (!serverName) {
				return {
					type: 'error',
					message: 'Server name is required.\n\nUsage: /server disconnect <server_name>'
				};
			}
			return this.handleDisconnectServer(serverName);
		}

		return {
			type: 'error',
			message: 'Usage: /server <command>\n\nCommands:\n  add              - Configure server\n  connect <name>   - Connect to server\n  disconnect <name> - Disconnect server\n\nExample: /server connect airbnb'
		};
	}

	private handleListServers(): CommandResult {
		const persistentServers = this.persistentConfig.mcpServers || {};
		const connectedServers = this.sessionServers || {};

		let serverList = '📋 MCP Server Status:\n\n';
		// Custom configured servers
		const configuredServerNames = Object.keys(persistentServers);
		if (configuredServerNames.length === 0) {
			serverList += 'No custom servers configured.\n\nUse /server add to configure servers, then /server connect <name> to connect.';
		} else {
			for (const [name, config] of Object.entries(persistentServers)) {
				const isConnected = connectedServers[name] !== undefined;
				const status = isConnected ? '🟢 Connected' : '🔴 Disconnected';
				const action = isConnected ? '/server disconnect' : '/server connect';

				serverList += `🔸 ${name}:\n`;
				serverList += `   Status: ${status}\n`;
				serverList += `   Command: ${config.command}\n`;
				if (config.args && config.args.length > 0) {
					serverList += `   Args: ${config.args.join(' ')}\n`;
				}
				if (config.env && Object.keys(config.env).length > 0) {
					serverList += `   Env: ${Object.entries(config.env).map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
				}
				serverList += `   Action: ${action} ${name}\n\n`;
			}
		}

		return {
			type: 'info',
			message: serverList.trim()
		};
	}

	private handleConnectServer(serverName: string): CommandResult {
		// Check if server is configured
		const configuredServer = this.persistentConfig.mcpServers?.[serverName];
		if (!configuredServer) {
			const availableServers = Object.keys(this.persistentConfig.mcpServers || {});
			return {
				type: 'error',
				message: `Server "${serverName}" is not configured.\n\nConfigured servers: ${availableServers.length > 0 ? availableServers.join(', ') : 'none'}\n\nUse /server add to configure new servers.`
			};
		}

		// Check if already connected (in session servers)
		if (this.sessionServers[serverName]) {
			return {
				type: 'info',
				message: `✅ Server "${serverName}" is already connected.`
			};
		}

		// Connect the server (add to session servers)
		this.sessionServers[serverName] = configuredServer;

		return {
			type: 'success',
			message: `✅ Connected to server "${serverName}"!\n\n🔄 Agent will be reinitialized with this server - attempting to establish connection...\nUse /tools to verify the server tools are available.`,
			data: { serverConnected: true, serverName, reinitializeAgent: true }
		};
	}

	private handleDisconnectServer(serverName: string): CommandResult {
		// Check if server is connected
		if (!this.sessionServers[serverName]) {
			const connectedServers = Object.keys(this.sessionServers);
			return {
				type: 'error',
				message: `Server "${serverName}" is not connected.\n\nConnected servers: ${connectedServers.length > 0 ? connectedServers.join(', ') : 'none'}`
			};
		}

		// Disconnect the server (remove from session servers)
		delete this.sessionServers[serverName];

		return {
			type: 'success',
			message: `✅ Disconnected from server "${serverName}".\n\n🔄 Agent will be reinitialized without this server.`,
			data: { serverDisconnected: true, serverName, reinitializeAgent: true }
		};
	}

	// Method to handle API key input and complete model selection
	handleApiKeyInput(apiKey: string, provider: string, model: string): CommandResult {
		// Validate the API key
		const validationResult = this.validateApiKey(provider, apiKey);
		if (!validationResult.valid) {
			return {
				type: 'error',
				message: validationResult.message
			};
		}

		// Map provider to environment variable name
		const envVarMap = {
			openai: 'OPENAI_API_KEY',
			anthropic: 'ANTHROPIC_API_KEY',
			google: 'GOOGLE_API_KEY',
			mistral: 'MISTRAL_API_KEY'
		};

		const envVar = envVarMap[provider as keyof typeof envVarMap];

		// Store the API key in persistent storage
		this.persistentConfig.apiKeys[envVar] = apiKey;

		// Set the model configuration
		this.currentLLMConfig = {
			provider: provider as any,
			model,
			temperature: this.currentLLMConfig?.temperature || 0.7,
			maxTokens: this.currentLLMConfig?.maxTokens
		};

		// Save both the API key and the current model to persistent storage
		this.persistentConfig.lastModel = this.currentLLMConfig;
		SecureStorage.saveConfig(this.persistentConfig);

		const maskedKey = this.maskApiKey(apiKey);
		return {
			type: 'success',
			message: `✅ ${provider} API key set (${maskedKey})\n🤖 Switched to ${provider}/${model}`,
			data: { llmConfig: this.currentLLMConfig }
		};
	}

	private handleLogs(args: string[]): CommandResult {
		const logPath = Logger.getLogPath();

		if (args.length === 0) {
			return {
				type: 'info',
				message: `📋 Debug logs are written to:\n${logPath}\n\nCommands:\n  /logs path    - Show log file path\n  /logs tail    - Show recent log entries\n  /clearlogs    - Clear all logs\n\nTo view logs in real-time:\n  tail -f ${logPath}`
			};
		}

		const subcommand = args[0];

		switch (subcommand) {
			case 'path':
				return {
					type: 'info',
					message: `📁 Log file location:\n${logPath}`
				};

			case 'tail':
				try {
					const fs = require('fs');
					if (!fs.existsSync(logPath)) {
						return {
							type: 'info',
							message: '📋 No log file found yet. Logs will be created when the app starts logging.'
						};
					}

					const logContent = fs.readFileSync(logPath, 'utf8');
					const lines = logContent.split('\n').filter((line: string) => line.trim());
					const recentLines = lines.slice(-20); // Show last 20 lines

					if (recentLines.length === 0) {
						return {
							type: 'info',
							message: '📋 Log file is empty.'
						};
					}

					return {
						type: 'info',
						message: `📋 Recent log entries (last ${recentLines.length} lines):\n\n${recentLines.join('\n')}`
					};
				} catch (error) {
					return {
						type: 'error',
						message: `❌ Failed to read logs: ${error instanceof Error ? error.message : 'Unknown error'}`
					};
				}

			default:
				return {
					type: 'error',
					message: `Unknown logs subcommand: ${subcommand}. Use /logs for help.`
				};
		}
	}

	private handleClearLogs(): CommandResult {
		try {
			Logger.clearLogs();
			Logger.info('Logs cleared by user command');
			return {
				type: 'success',
				message: '✅ Debug logs cleared successfully.'
			};
		} catch (error) {
			return {
				type: 'error',
				message: `❌ Failed to clear logs: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	private handleHistory(): CommandResult {
		return {
			type: 'info',
			message: `📜 Input History Navigation:\n\n🔼 Arrow Up   - Navigate to previous inputs\n🔽 Arrow Down - Navigate to newer inputs\n\n💡 Tips:\n• Your input history is automatically saved during the session\n• Use ↑ to recall previous commands and messages\n• Use ↓ to navigate back to newer inputs\n• History is reset when you restart the CLI\n\n🎯 Try it now: Press the up arrow key in the input box!`
		};
	}
}