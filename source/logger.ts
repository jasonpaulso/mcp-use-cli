import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_DIR = path.join(os.homedir(), '.mcp-use-cli');
const LOG_FILE = path.join(LOG_DIR, 'debug.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
	fs.mkdirSync(LOG_DIR, {recursive: true});
}

export class Logger {
	private static formatMessage(
		level: string,
		message: string,
		data?: unknown,
	): string {
		const timestamp = new Date().toISOString();
		const dataStr = data ? ` | Data: ${JSON.stringify(data, null, 2)}` : '';
		return `[${timestamp}] ${level.toUpperCase()}: ${message}${dataStr}\n`;
	}

	private static writeToFile(content: string): void {
		try {
			fs.appendFileSync(LOG_FILE, content);
		} catch (error) {
			// Fallback to console if file write fails
			console.error('Failed to write to log file:', error);
		}
	}

	static debug(message: string, data?: unknown): void {
		this.writeToFile(this.formatMessage('debug', message, data));
	}

	static info(message: string, data?: unknown): void {
		this.writeToFile(this.formatMessage('info', message, data));
	}

	static warn(message: string, data?: unknown): void {
		this.writeToFile(this.formatMessage('warn', message, data));
	}

	static error(message: string, data?: unknown): void {
		this.writeToFile(this.formatMessage('error', message, data));
	}

	static getLogPath(): string {
		return LOG_FILE;
	}

	static clearLogs(): void {
		try {
			fs.writeFileSync(LOG_FILE, '');
		} catch (error) {
			console.error('Failed to clear log file:', error);
		}
	}
}
