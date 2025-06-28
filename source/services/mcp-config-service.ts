import {SecureStorage, StoredConfig} from '../storage.js';

export interface MCPServerConfig {
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

export interface MCPServerConfigResult {
	success: boolean;
	message: string;
	data?: any;
}

export class MCPConfigService {
	private persistentConfig: StoredConfig;
	private sessionServers: Record<string, MCPServerConfig> = {};

	constructor() {
		this.persistentConfig = SecureStorage.loadConfig();
	}

	getSessionServers(): Record<string, MCPServerConfig> {
		return this.sessionServers;
	}

	getConfiguredServers(): Record<string, MCPServerConfig> {
		return this.persistentConfig.mcpServers || {};
	}

	isServerConfigured(serverName: string): boolean {
		return !!this.persistentConfig.mcpServers?.[serverName];
	}

	isServerConnected(serverName: string): boolean {
		return !!this.sessionServers[serverName];
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
				const server = serverConfig as any;
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

			// Auto-connect all newly configured servers
			Object.assign(this.sessionServers, servers);

			const serverList = serverNames.map(name => `• ${name}`).join('\n');

			return {
				success: true,
				message: `Configured and connected ${serverNames.length} server(s)!\n\n${serverList}`,
				data: {
					serversAdded: true,
					serverConnected: true,
					serverNames,
					reinitializeAgent: true,
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

		// Auto-connect the newly configured server
		this.sessionServers[name] = config;

		return {
			success: true,
			message: `Server "${name}" configured and connected!`,
			data: {
				serverAdded: true,
				serverConnected: true,
				serverName: name,
				reinitializeAgent: true,
			},
		};
	}

	connectServer(serverName: string): MCPServerConfigResult {
		// Check if server is configured
		const configuredServer = this.persistentConfig.mcpServers?.[serverName];
		if (!configuredServer) {
			const availableServers = Object.keys(
				this.persistentConfig.mcpServers || {},
			);
			return {
				success: false,
				message: `Server "${serverName}" is not configured.\n\nConfigured servers: ${
					availableServers.length > 0 ? availableServers.join(', ') : 'none'
				}\n\nUse /server add to configure new servers.`,
			};
		}

		// Check if already connected
		if (this.sessionServers[serverName]) {
			return {
				success: true,
				message: `Server "${serverName}" is already connected.`,
			};
		}

		// Connect the server (add to session servers)
		this.sessionServers[serverName] = configuredServer;

		return {
			success: true,
			message: `Connected to server "${serverName}"!`,
			data: {serverConnected: true, serverName, reinitializeAgent: true},
		};
	}

	disconnectServer(serverName: string): MCPServerConfigResult {
		// Check if server is connected
		if (!this.sessionServers[serverName]) {
			const connectedServers = Object.keys(this.sessionServers);
			return {
				success: false,
				message: `Server "${serverName}" is not connected.\n\nConnected servers: ${
					connectedServers.length > 0 ? connectedServers.join(', ') : 'none'
				}`,
			};
		}

		// Disconnect the server (remove from session servers)
		delete this.sessionServers[serverName];

		return {
			success: true,
			message: `Disconnected from server "${serverName}".`,
			data: {serverDisconnected: true, serverName, reinitializeAgent: true},
		};
	}

	getServerStatus(): Array<{
		name: string;
		isConnected: boolean;
		config: MCPServerConfig;
	}> {
		const persistentServers = this.persistentConfig.mcpServers || {};
		const status: Array<{
			name: string;
			isConnected: boolean;
			config: MCPServerConfig;
		}> = [];

		for (const [name, config] of Object.entries(persistentServers)) {
			status.push({
				name,
				isConnected: !!this.sessionServers[name],
				config,
			});
		}

		return status;
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
}
