import {Box, Text} from 'ink';
import React from 'react';
import type {ServerStatus as ServerStatusData} from '../types.js';
import type {MCPServerConfig} from '../services/mcp-config-service.js';

interface ServerStatusProps {
	servers: ServerStatusData[];
}

export function ServerStatus({servers}: ServerStatusProps) {
	return (
		<Box flexDirection="column">
			{servers.map(server => (
				<Box
					key={server.name}
					flexDirection="column"
					borderStyle="round"
					borderColor="gray"
					paddingX={1}
				>
					<Box>
						{server.isConnected ? (
							<Text bold> 🔹{server.name}</Text>
						) : (
							<Text bold> 🔸 {server.name}</Text>
						)}
					</Box>
					<Box>
						<Text>
							Status:{' '}
							{server.isConnected ? (
								<Text color="green">Connected</Text>
							) : (
								<Text color="red">Disconnected</Text>
							)}
						</Text>
					</Box>
					<Box>
						<Text>Command: {(server.config as MCPServerConfig).command}</Text>
					</Box>
					{(server.config as MCPServerConfig).args &&
						(server.config as MCPServerConfig).args!.length > 0 && (
							<Box>
								<Text>
									Args: {(server.config as MCPServerConfig).args!.join(' ')}
								</Text>
							</Box>
						)}
					{(server.config as MCPServerConfig).env &&
						Object.keys((server.config as MCPServerConfig).env!).length > 0 && (
							<Box>
								<Text>
									Env:{' '}
									{Object.entries((server.config as MCPServerConfig).env!)
										.map(([k, v]) => `${k}=${v}`)
										.join(', ')}
								</Text>
							</Box>
						)}
					<Box>
						<Text>
							Action: /server {server.isConnected ? 'disconnect' : 'connect'}{' '}
							{server.name}
						</Text>
					</Box>
				</Box>
			))}
		</Box>
	);
}
