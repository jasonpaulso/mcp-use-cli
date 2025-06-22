import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.mcp-use-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const SALT = 'mcp-use-cli-salt'; // In production, this should be more secure

export interface StoredConfig {
	apiKeys: Record<string, string>;
	lastModel?: {
		provider: string;
		model: string;
		temperature?: number;
		maxTokens?: number;
	};
	mcpServers?: Record<string, {
		command: string;
		args?: string[];
		env?: Record<string, string>;
	}>;
}

export class SecureStorage {
	private static getKey(): Buffer {
		return scryptSync('mcp-use-cli-encryption-key', SALT, 32);
	}

	private static encrypt(text: string): string {
		try {
			const iv = randomBytes(16);
			const key = this.getKey();
			const cipher = createCipheriv('aes-256-cbc', key, iv);
			
			let encrypted = cipher.update(text, 'utf8', 'hex');
			encrypted += cipher.final('hex');
			
			return iv.toString('hex') + ':' + encrypted;
		} catch (error) {
			console.error('Encryption error:', error);
			return text; // Fallback to plaintext if encryption fails
		}
	}

	private static decrypt(encryptedText: string): string {
		try {
			const parts = encryptedText.split(':');
			if (parts.length !== 2 || !parts[0] || !parts[1]) {
				// Old format or plaintext, return as-is
				return encryptedText;
			}
			
			const iv = Buffer.from(parts[0], 'hex');
			const encryptedData = parts[1];
			const key = this.getKey();
			const decipher = createDecipheriv('aes-256-cbc', key, iv);
			
			let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
			decrypted += decipher.final('utf8');
			
			return decrypted;
		} catch (error) {
			console.error('Decryption error:', error);
			return encryptedText; // Fallback to return as-is if decryption fails
		}
	}

	static ensureConfigDir(): void {
		if (!existsSync(CONFIG_DIR)) {
			mkdirSync(CONFIG_DIR, { recursive: true });
		}
	}

	static loadConfig(): StoredConfig {
		this.ensureConfigDir();
		
		if (!existsSync(CONFIG_FILE)) {
			return { apiKeys: {} };
		}

		try {
			const configData = readFileSync(CONFIG_FILE, 'utf8');
			const parsed = JSON.parse(configData);
			
			// Decrypt API keys
			const decryptedApiKeys: Record<string, string> = {};
			for (const [key, encryptedValue] of Object.entries(parsed.apiKeys || {})) {
				if (typeof encryptedValue === 'string') {
					decryptedApiKeys[key] = this.decrypt(encryptedValue);
				}
			}

			return {
				...parsed,
				apiKeys: decryptedApiKeys
			};
		} catch (error) {
			console.error('Error loading config:', error);
			return { apiKeys: {} };
		}
	}

	static saveConfig(config: StoredConfig): void {
		this.ensureConfigDir();
		
		try {
			// Encrypt API keys before saving
			const encryptedApiKeys: Record<string, string> = {};
			for (const [key, value] of Object.entries(config.apiKeys)) {
				encryptedApiKeys[key] = this.encrypt(value);
			}

			const configToSave = {
				...config,
				apiKeys: encryptedApiKeys
			};

			writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2), 'utf8');
		} catch (error) {
			console.error('Error saving config:', error);
		}
	}

	static clearConfig(): void {
		this.ensureConfigDir();
		
		try {
			if (existsSync(CONFIG_FILE)) {
				writeFileSync(CONFIG_FILE, JSON.stringify({ apiKeys: {} }, null, 2), 'utf8');
			}
		} catch (error) {
			console.error('Error clearing config:', error);
		}
	}

	static getConfigPath(): string {
		return CONFIG_FILE;
	}
}