import {SecureStorage, StoredConfig} from '../storage.js';
import type {CommandResult} from '../types.js';

export interface MCPServerConfig {
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

export interface MCPServerConfigResult {
	success: boolean;
	message: string;
	data?: unknown;
}

export class MCPConfigService {
	private persistentConfig: StoredConfig;

	constructor() {
		this.persistentConfig = SecureStorage.loadConfig();
	}

	getConfiguredServers(): Record<string, MCPServerConfig> {
		return this.persistentConfig.mcpServers || {};
	}

	isServerConfigured(serverName: string): boolean {
		return !!this.persistentConfig.mcpServers?.[serverName];
	}

	addServerFromJSON(jsonConfig: string): MCPServerConfigResult {
		try {
			const parsedConfig = JSON.parse(jsonConfig);

			// Validate JSON structure
			if (
				!parsedConfig.mcpServers ||
				typeof parsedConfig.mcpServers !== 'object'
			) {
				return {
					success: false,
					message:
						'Invalid JSON format. Expected format:\n{\n  "mcpServers": {\n    "servername": {\n      "command": "...",\n      "args": [...]\n    }\n  }\n}',
				};
			}

			const servers = parsedConfig.mcpServers;
			const serverNames = Object.keys(servers);

			if (serverNames.length === 0) {
				return {
					success: false,
					message: 'No servers found in JSON configuration.',
				};
			}

			// Check for conflicts with existing servers
			const existingServers = this.persistentConfig.mcpServers || {};
			const conflicts = serverNames.filter(name => existingServers[name]);

			if (conflicts.length > 0) {
				return {
					success: false,
					message: `Server(s) already exist: ${conflicts.join(
						', ',
					)}. Please use different names.`,
				};
			}

			// Validate each server config
			for (const [name, serverConfig] of Object.entries(servers)) {
				const server = serverConfig as MCPServerConfig;
				if (!server.command || typeof server.command !== 'string') {
					return {
						success: false,
						message: `Server "${name}" missing required "command" field.`,
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

			const serverList = serverNames.map(name => `• ${name}`).join('\n');

			return {
				success: true,
				message: `Configured ${serverNames.length} server(s)!\n\n${serverList}`,
				data: {
					serversAdded: true,
					serverNames,
				},
			};
		} catch (error) {
			return {
				success: false,
				message: `Invalid JSON format: ${
					error instanceof Error ? error.message : 'Parse error'
				}\n\nPlease check your JSON syntax and try again.`,
			};
		}
	}

	addServer(name: string, config: MCPServerConfig): MCPServerConfigResult {
		// Check if server name already exists
		if (this.persistentConfig.mcpServers?.[name]) {
			return {
				success: false,
				message: `Server "${name}" already exists. Use a different name.`,
			};
		}

		// Add server to persistent configuration
		if (!this.persistentConfig.mcpServers) {
			this.persistentConfig.mcpServers = {};
		}

		this.persistentConfig.mcpServers[name] = config;

		// Save configuration
		SecureStorage.saveConfig(this.persistentConfig);

		return {
			success: true,
			message: `Server "${name}" configured!`,
			data: {
				serverAdded: true,
				serverName: name,
			},
		};
	}

	/**
	 * Gets the configuration for a specific server.
	 * @param serverName - Name of the server
	 * @returns The server configuration or null if not found
	 */
	getServerConfig(serverName: string): MCPServerConfig | null {
		return this.persistentConfig.mcpServers?.[serverName] || null;
	}

	/**
	 * Gets all configured servers with their configurations.
	 * Note: Connection status should be determined by the caller using AgentService.
	 * @returns Array of server configurations
	 */
	getAllServers(): Array<{
		name: string;
		config: MCPServerConfig;
	}> {
		const persistentServers = this.persistentConfig.mcpServers || {};
		const servers: Array<{
			name: string;
			config: MCPServerConfig;
		}> = [];

		for (const [name, config] of Object.entries(persistentServers)) {
			servers.push({
				name,
				config,
			});
		}

		return servers;
	}

	getServerTestCommand(serverName: string): {
		success: boolean;
		command?: string;
		message?: string;
	} {
		const serverConfig = this.persistentConfig.mcpServers?.[serverName];

		if (!serverConfig) {
			const configuredServers = Object.keys(
				this.persistentConfig.mcpServers || {},
			);
			return {
				success: false,
				message: `Server "${serverName}" is not configured.\n\nConfigured servers: ${
					configuredServers.length > 0 ? configuredServers.join(', ') : 'none'
				}`,
			};
		}

		const command = serverConfig.command;
		const args_str = serverConfig.args ? serverConfig.args.join(' ') : '';
		const full_command = `${command} ${args_str}`.trim();

		return {
			success: true,
			command: full_command,
		};
	}

	validateServerName(name: string): {valid: boolean; message?: string} {
		if (!name || !name.trim()) {
			return {valid: false, message: 'Server name cannot be empty.'};
		}

		if (this.persistentConfig.mcpServers?.[name.trim()]) {
			return {
				valid: false,
				message: `Server "${name.trim()}" already exists. Use a different name.`,
			};
		}

		return {valid: true};
	}

	parseEnvironmentVariables(envString: string): Record<string, string> {
		const env: Record<string, string> = {};
		if (envString.trim()) {
			const envLines = envString.trim().split('\n');
			for (const line of envLines) {
				const [key, ...valueParts] = line.split('=');
				if (key && valueParts.length > 0) {
					env[key.trim()] = valueParts.join('=').trim();
				}
			}
		}
		return env;
	}

	/**
	 * Handles the /server command and its subcommands.
	 * @param args - Array of arguments where args[0] is the subcommand
	 * @returns A CommandResult with the appropriate response
	 */
	handleServerCommand(args: string[]): CommandResult {
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
				const configuredServers = Object.keys(this.getConfiguredServers());
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
			return {
				type: 'info',
				message: `Server connect command received for: ${serverName}`,
				data: {connectServer: true, serverName},
			};
		}

		if (args[0] === 'disconnect') {
			if (args.length < 2) {
				return {
					type: 'error',
					message: 'Usage: /server disconnect <server_name>',
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
			return {
				type: 'info',
				message: `Server disconnect command received for: ${serverName}`,
				data: {disconnectServer: true, serverName},
			};
		}

		return {
			type: 'error',
			message:
				'Usage: /server <command>\n\nCommands:\n  add              - Configure server\n  connect <name>   - Connect to server\n  disconnect <name> - Disconnect server\n\nExample: /server connect airbnb',
		};
	}

	/**
	 * Handles the /servers command to list all servers and their connection status.
	 * @returns A CommandResult with the server list
	 */
	handleListServersCommand(): CommandResult {
		const servers = this.getAllServers();

		if (servers.length === 0) {
			return {
				type: 'info',
				message:
					'No custom servers configured.\n\nUse /server add to configure servers, then /server connect <name> to connect.',
			};
		}

		return {
			type: 'list_servers',
			message: 'MCP Server Status:',
			data: {servers},
		};
	}

	/**
	 * Handles the /test-server command to test server configuration.
	 * @param args - Array where args[0] is the server name
	 * @returns A CommandResult with test information
	 */
	handleTestServerCommand(args: string[]): CommandResult {
		if (args.length === 0) {
			const configuredServers = Object.keys(this.getConfiguredServers());
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

		const result = this.getServerTestCommand(serverName);
		if (!result.success) {
			return {
				type: 'error',
				message: result.message!,
			};
		}

		return {
			type: 'info',
			message: `🧪 Testing server "${serverName}"...\n\nCommand: ${result.command}\n\n Note: This will attempt to run the server command manually.\nCheck the console for output and errors.\n\n Try running this command manually in your terminal:\n${result.command}`,
			data: {testServer: true, serverName, command: result.command},
		};
	}

	/**
	 * Handles server configuration input during the interactive setup flow.
	 * @param input - User input string
	 * @param step - Current step in the configuration flow
	 * @param serverConfig - Partial server configuration being built
	 * @returns A CommandResult to continue or complete the flow
	 */
	handleServerConfigInput(
		input: string,
		step: string,
		serverConfig?: Partial<MCPServerConfig> & {name?: string},
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
					const result = this.addServerFromJSON(trimmedInput);
					if (!result.success) {
						return {
							type: 'error',
							message: result.message,
						};
					}

					return {
						type: 'success',
						message: `${result.message}.`,
						data: result.data,
					};
				}

				// Not JSON, treat as server name for interactive setup
				const validation = this.validateServerName(trimmedInput);
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
				const nameValidation = this.validateServerName(input.trim());
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
				config.env = this.parseEnvironmentVariables(input);

				return {
					type: 'prompt_server_config',
					message: `Server Configuration Summary:\n\nName: ${
						config.name
					}\nCommand: ${config.command}\nArgs: ${
						config.args && config.args.length > 0
							? config.args.join(' ')
							: 'none'
					}\nEnv: ${
						config.env && Object.keys(config.env).length > 0
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
					if (!config.command) {
						return {
							type: 'error',
							message: 'Server command is required',
						};
					}
					const serverConfig: MCPServerConfig = {
						command: config.command,
						args: config.args,
						env: config.env,
					};

					const result = this.addServer(config.name || '', serverConfig);
					if (!result.success) {
						return {
							type: 'error',
							message: result.message,
						};
					}

					return {
						type: 'success',
						message: `${result.message}.`,
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
}
