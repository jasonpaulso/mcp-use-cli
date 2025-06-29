import {ChatOpenAI} from '@langchain/openai';
import {ChatAnthropic} from '@langchain/anthropic';
import {ChatGoogleGenerativeAI} from '@langchain/google-genai';
import {ChatMistralAI} from '@langchain/mistralai';
import {SecureStorage, StoredConfig} from '../storage.js';
import type {CommandResult} from '../types.js';

export interface LLMConfig {
	provider: 'openai' | 'anthropic' | 'google' | 'mistral';
	model: string;
	temperature?: number;
	maxTokens?: number;
}

export class LLMService {
	private currentLLMConfig: LLMConfig | null = null;
	private sessionApiKeys: Record<string, string> = {};
	private persistentConfig: StoredConfig;

	private availableModels = {
		openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
		anthropic: [
			'claude-3-5-sonnet-20241022',
			'claude-3-5-haiku-20241022',
			'claude-3-opus-20240229',
			'claude-3-sonnet-20240229',
			'claude-3-haiku-20240307',
		],
		google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
		mistral: [
			'mistral-large-latest',
			'mistral-medium-latest',
			'mistral-small-latest',
		],
	};

	constructor() {
		this.persistentConfig = SecureStorage.loadConfig();
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
				mistral: 'MISTRAL_API_KEY',
			}[lastModel.provider];

			// Check if we still have the API key for the last used model
			if (envVar && this.getApiKey(envVar)) {
				this.currentLLMConfig = {
					provider: lastModel.provider as LLMConfig['provider'],
					model: lastModel.model,
					temperature: lastModel.temperature || 0.7,
					maxTokens: lastModel.maxTokens,
				};
				return;
			}
		}

		const providers = [
			{
				name: 'openai' as const,
				envVar: 'OPENAI_API_KEY',
				defaultModel: 'gpt-4o-mini',
			},
			{
				name: 'anthropic' as const,
				envVar: 'ANTHROPIC_API_KEY',
				defaultModel: 'claude-3-5-sonnet-20241022',
			},
			{
				name: 'google' as const,
				envVar: 'GOOGLE_API_KEY',
				defaultModel: 'gemini-1.5-pro',
			},
			{
				name: 'mistral' as const,
				envVar: 'MISTRAL_API_KEY',
				defaultModel: 'mistral-large-latest',
			},
		];

		// Find first available provider
		for (const provider of providers) {
			if (this.getApiKey(provider.envVar)) {
				this.currentLLMConfig = {
					provider: provider.name,
					model: provider.defaultModel,
					temperature: 0.7,
				};
				return;
			}
		}

		// No provider found - leave null, will show setup message
		this.currentLLMConfig = null;
	}

	private getApiKey(envVar: string): string | undefined {
		// Check session keys first, then persistent storage, then environment variables
		return (
			this.sessionApiKeys[envVar] ||
			this.persistentConfig.apiKeys[envVar] ||
			process.env[envVar]
		);
	}

	getAvailableProviders(): string[] {
		const providers = [];
		if (this.getApiKey('OPENAI_API_KEY')) providers.push('openai');
		if (this.getApiKey('ANTHROPIC_API_KEY')) providers.push('anthropic');
		if (this.getApiKey('GOOGLE_API_KEY')) providers.push('google');
		if (this.getApiKey('MISTRAL_API_KEY')) providers.push('mistral');
		return providers;
	}

	isAnyProviderAvailable(): boolean {
		return this.getAvailableProviders().length > 0;
	}

	getAvailableModels(provider?: string): Record<string, string[]> | string[] {
		if (
			provider &&
			this.availableModels[provider as keyof typeof this.availableModels]
		) {
			return this.availableModels[
				provider as keyof typeof this.availableModels
			];
		}
		return this.availableModels;
	}

	getCurrentConfig(): LLMConfig | null {
		return this.currentLLMConfig ? {...this.currentLLMConfig} : null;
	}

	setModel(
		provider: string,
		model: string,
	): {
		success: boolean;
		message: string;
		requiresApiKey?: boolean;
		envVar?: string;
	} {
		if (!this.availableModels[provider as keyof typeof this.availableModels]) {
			return {success: false, message: `Unknown provider: ${provider}`};
		}

		// Check if the provider's API key is available
		const availableProviders = this.getAvailableProviders();
		if (!availableProviders.includes(provider)) {
			const envVarMap = {
				openai: 'OPENAI_API_KEY',
				anthropic: 'ANTHROPIC_API_KEY',
				google: 'GOOGLE_API_KEY',
				mistral: 'MISTRAL_API_KEY',
			};

			return {
				success: false,
				message: `API key not found for ${provider}`,
				requiresApiKey: true,
				envVar: envVarMap[provider as keyof typeof envVarMap],
			};
		}

		const models =
			this.availableModels[provider as keyof typeof this.availableModels];
		if (!models.includes(model)) {
			return {
				success: false,
				message: `Model ${model} not available for ${provider}`,
			};
		}

		this.currentLLMConfig = {
			provider: provider as LLMConfig['provider'],
			model,
			temperature: this.currentLLMConfig?.temperature || 0.7,
			maxTokens: this.currentLLMConfig?.maxTokens,
		};

		// Save the current model to persistent storage
		this.persistentConfig.lastModel = this.currentLLMConfig;
		SecureStorage.saveConfig(this.persistentConfig);

		return {success: true, message: `Switched to ${provider} ${model}`};
	}

	setTemperature(temperature: number): {success: boolean; message: string} {
		if (!this.currentLLMConfig) {
			return {success: false, message: 'No model configured'};
		}

		if (temperature < 0 || temperature > 2) {
			return {
				success: false,
				message: 'Temperature must be between 0.0 and 2.0',
			};
		}

		this.currentLLMConfig.temperature = temperature;
		return {success: true, message: `Temperature set to ${temperature}`};
	}

	setMaxTokens(maxTokens: number): {success: boolean; message: string} {
		if (!this.currentLLMConfig) {
			return {success: false, message: 'No model configured'};
		}

		if (maxTokens < 1) {
			return {success: false, message: 'Max tokens must be a positive integer'};
		}

		this.currentLLMConfig.maxTokens = maxTokens;
		return {success: true, message: `Max tokens set to ${maxTokens}`};
	}

	validateApiKey(
		provider: string,
		apiKey: string,
	): {valid: boolean; message: string} {
		if (!apiKey || apiKey.trim().length === 0) {
			return {valid: false, message: 'API key cannot be empty'};
		}

		// Basic format validation for each provider
		switch (provider) {
			case 'openai':
				if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
					return {
						valid: false,
						message:
							'OpenAI API keys should start with "sk-" and be at least 20 characters long',
					};
				}
				break;
			case 'anthropic':
				if (
					(!apiKey.startsWith('ant_') && !apiKey.startsWith('sk-ant-')) ||
					apiKey.length < 20
				) {
					return {
						valid: false,
						message:
							'Anthropic API keys should start with "ant_" or "sk-ant-" and be at least 20 characters long',
					};
				}
				break;
			case 'google':
				if (apiKey.length < 20) {
					return {
						valid: false,
						message: 'Google API keys should be at least 20 characters long',
					};
				}
				break;
			case 'mistral':
				if (apiKey.length < 20) {
					return {
						valid: false,
						message: 'Mistral API keys should be at least 20 characters long',
					};
				}
				break;
		}

		return {valid: true, message: ''};
	}

	setApiKey(
		provider: string,
		apiKey: string,
		shouldAutoSelect: boolean = false,
	): {success: boolean; message: string; autoSelected?: LLMConfig} {
		const validationResult = this.validateApiKey(provider, apiKey);
		if (!validationResult.valid) {
			return {success: false, message: validationResult.message};
		}

		// Map provider to environment variable name
		const envVarMap = {
			openai: 'OPENAI_API_KEY',
			anthropic: 'ANTHROPIC_API_KEY',
			google: 'GOOGLE_API_KEY',
			mistral: 'MISTRAL_API_KEY',
		};

		const envVar = envVarMap[provider as keyof typeof envVarMap];

		// Store the API key in persistent storage
		this.persistentConfig.apiKeys[envVar] = apiKey;
		SecureStorage.saveConfig(this.persistentConfig);

		let autoSelected: LLMConfig | undefined;
		if (shouldAutoSelect && !this.currentLLMConfig) {
			const defaultModels = {
				openai: 'gpt-4o-mini',
				anthropic: 'claude-3-5-sonnet-20241022',
				google: 'gemini-1.5-pro',
				mistral: 'mistral-large-latest',
			};

			this.currentLLMConfig = {
				provider: provider as any,
				model: defaultModels[provider as keyof typeof defaultModels],
				temperature: 0.7,
			};
			autoSelected = this.currentLLMConfig;
		}

		return {
			success: true,
			message: `${provider} API key set`,
			autoSelected,
		};
	}

	clearApiKeys(): void {
		this.sessionApiKeys = {};
		this.persistentConfig.apiKeys = {};
		this.persistentConfig.lastModel = undefined;
		this.currentLLMConfig = null;
		SecureStorage.saveConfig(this.persistentConfig);
	}

	maskApiKey(apiKey: string): string {
		if (apiKey.length <= 8) {
			return '*'.repeat(apiKey.length);
		}
		const start = apiKey.substring(0, 4);
		const end = apiKey.substring(apiKey.length - 4);
		const middle = '*'.repeat(Math.min(12, apiKey.length - 8));
		return `${start}${middle}${end}`;
	}

	getApiKeyStatus(): Record<
		string,
		{status: string; source: string; masked: string}
	> {
		const status: Record<
			string,
			{status: string; source: string; masked: string}
		> = {};
		const providers = ['openai', 'anthropic', 'google', 'mistral'] as const;

		providers.forEach(provider => {
			const envVarMap = {
				openai: 'OPENAI_API_KEY',
				anthropic: 'ANTHROPIC_API_KEY',
				google: 'GOOGLE_API_KEY',
				mistral: 'MISTRAL_API_KEY',
			} as const;

			const envVar = envVarMap[provider];
			const hasEnvKey = !!process.env[envVar];
			const hasSessionKey = !!this.sessionApiKeys[envVar];
			const hasPersistentKey = !!this.persistentConfig.apiKeys[envVar];

			if (hasSessionKey) {
				const key = this.sessionApiKeys[envVar]!;
				status[provider] = {
					status: 'set',
					source: 'session',
					masked: this.maskApiKey(key),
				};
			} else if (hasPersistentKey) {
				const key = this.persistentConfig.apiKeys[envVar]!;
				status[provider] = {
					status: 'set',
					source: 'stored',
					masked: this.maskApiKey(key),
				};
			} else if (hasEnvKey) {
				const key = process.env[envVar]!;
				status[provider] = {
					status: 'set',
					source: 'env',
					masked: this.maskApiKey(key),
				};
			} else {
				status[provider] = {
					status: 'not set',
					source: 'none',
					masked: '',
				};
			}
		});

		return status;
	}

	createLLM(): any {
		if (!this.currentLLMConfig) {
			throw new Error(
				'No LLM configured. Use /model command to select a provider and model.',
			);
		}

		const config = this.currentLLMConfig;
		const baseConfig = {
			temperature: config.temperature || 0.7,
			maxTokens: config.maxTokens,
		};

		switch (config.provider) {
			case 'openai':
				const openaiKey = this.getApiKey('OPENAI_API_KEY');
				if (!openaiKey) {
					throw new Error(
						'OPENAI_API_KEY is required for OpenAI models. Use /setkey openai <your-key>',
					);
				}
				return new ChatOpenAI({
					modelName: config.model,
					openAIApiKey: openaiKey,
					...baseConfig,
				});

			case 'anthropic':
				const anthropicKey = this.getApiKey('ANTHROPIC_API_KEY');
				if (!anthropicKey) {
					throw new Error(
						'ANTHROPIC_API_KEY is required for Anthropic models. Use /setkey anthropic <your-key>',
					);
				}
				return new ChatAnthropic({
					modelName: config.model,
					anthropicApiKey: anthropicKey,
					...baseConfig,
				}) as any;

			case 'google':
				const googleKey = this.getApiKey('GOOGLE_API_KEY');
				if (!googleKey) {
					throw new Error(
						'GOOGLE_API_KEY is required for Google models. Use /setkey google <your-key>',
					);
				}
				return new ChatGoogleGenerativeAI({
					model: config.model,
					apiKey: googleKey,
					...baseConfig,
				}) as any;

			case 'mistral':
				const mistralKey = this.getApiKey('MISTRAL_API_KEY');
				if (!mistralKey) {
					throw new Error(
						'MISTRAL_API_KEY is required for Mistral models. Use /setkey mistral <your-key>',
					);
				}
				return new ChatMistralAI({
					modelName: config.model,
					apiKey: mistralKey,
					...baseConfig,
				}) as any;

			default:
				throw new Error(`Unsupported provider: ${config.provider}`);
		}
	}

	/**
	 * Handles the /model command to select a provider and model.
	 * @param args - Array of arguments where args[0] is provider and args[1] is model
	 * @returns A CommandResult with success/error status and prompts for API key if needed
	 */
	handleModelCommand(args: string[]): CommandResult {
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

		const availableModels = this.getAvailableModels() as Record<
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
		const result = this.setModel(provider, model);

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
			data: {llmConfig: this.getCurrentConfig()},
		};
	}

	/**
	 * Handles the /models command to list available models.
	 * @param args - Optional array with provider name to filter models
	 * @returns A CommandResult with the list of available models
	 */
	handleListModelsCommand(args: string[]): CommandResult {
		const currentConfig = this.getCurrentConfig();

		if (args.length === 0) {
			let modelList = '📋 Available models by provider:\n\n';
			const availableModels = this.getAvailableModels() as Record<
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

		const availableModels = this.getAvailableModels() as Record<
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
		const models = this.getAvailableModels(provider) as string[];
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

	/**
	 * Handles the /config command to adjust temperature and max tokens.
	 * @param args - Array where args[0] is setting name and args[1] is value
	 * @returns A CommandResult with success/error status
	 */
	handleConfigCommand(args: string[]): CommandResult {
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

		if (!this.getCurrentConfig()) {
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
				const tempResult = this.setTemperature(temp);
				if (!tempResult.success) {
					return {
						type: 'error',
						message: tempResult.message,
					};
				}
				return {
					type: 'success',
					message: `✅ ${tempResult.message}`,
					data: {llmConfig: this.getCurrentConfig()},
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
				const tokensResult = this.setMaxTokens(tokens);
				if (!tokensResult.success) {
					return {
						type: 'error',
						message: tokensResult.message,
					};
				}
				return {
					type: 'success',
					message: `✅ ${tokensResult.message}`,
					data: {llmConfig: this.getCurrentConfig()},
				};

			default:
				return {
					type: 'error',
					message: `Unknown setting: ${setting}\nAvailable settings: temp, tokens`,
				};
		}
	}

	/**
	 * Handles the /setkey command to manually set API keys.
	 * @param args - Array where args[0] is provider and args[1] is API key
	 * @returns A CommandResult with success/error status
	 */
	handleSetKeyCommand(args: string[]): CommandResult {
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
		const shouldAutoSelect = !this.getCurrentConfig();

		// Set the API key
		const result = this.setApiKey(provider, apiKey, shouldAutoSelect);

		if (!result.success) {
			return {
				type: 'error',
				message: result.message,
			};
		}

		const maskedKey = this.maskApiKey(apiKey);
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

	/**
	 * Handles the /clearkeys command to clear all stored API keys.
	 * @returns A CommandResult indicating success
	 */
	handleClearKeysCommand(): CommandResult {
		this.clearApiKeys();

		return {
			type: 'success',
			message:
				'✅ All API keys cleared from storage.\n\nUse /setkey or /model to set up a new provider.',
			data: {llmConfig: null},
		};
	}

	/**
	 * Handles API key input when prompted during model selection.
	 * @param apiKey - The API key entered by the user
	 * @param provider - The provider for the API key
	 * @param model - The model to select after setting the key
	 * @returns A CommandResult with success/error status
	 */
	handleApiKeyInput(
		apiKey: string,
		provider: string,
		model: string,
	): CommandResult {
		// Set the API key
		const keyResult = this.setApiKey(provider, apiKey, false);
		if (!keyResult.success) {
			return {
				type: 'error',
				message: keyResult.message,
			};
		}

		// Now set the model
		const modelResult = this.setModel(provider, model);
		if (!modelResult.success) {
			return {
				type: 'error',
				message: modelResult.message,
			};
		}

		const maskedKey = this.maskApiKey(apiKey);
		return {
			type: 'success',
			message: `✅ ${provider} API key set (${maskedKey})\n🤖 Switched to ${provider}/${model}`,
			data: {llmConfig: this.getCurrentConfig()},
		};
	}
}
