import { Box, Text } from 'ink';
import React from 'react';
import type { ServerStatus as ServerStatusData } from '../types.js';

interface ServerStatusProps {
    servers: ServerStatusData[];
}

export function ServerStatus({ servers }: ServerStatusProps) {
    return (
        <Box flexDirection="column" >
            {servers.map(server => (
                <Box
                    key={server.name}
                    flexDirection="column"
                    borderStyle="round"
                    borderColor="gray"
                    paddingX={1}
                >
                    <Box>
                        {server.isConnected ? <Text bold> 🔹{server.name}</Text> : <Text bold> 🔸 {server.name}</Text>}
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
                        <Text>Command: {server.config.command}</Text>
                    </Box>
                    {server.config.args && server.config.args.length > 0 && (
                        <Box>
                            <Text>Args: {server.config.args.join(' ')}</Text>
                        </Box>
                    )}
                    {server.config.env && Object.keys(server.config.env).length > 0 && (
                        <Box>
                            <Text>
                                Env:{' '}
                                {Object.entries(server.config.env)
                                    .map(([k, v]) => `${k}=${v}`)
                                    .join(', ')}
                            </Text>
                        </Box>
                    )}
                    <Box>
                        <Text>
                            Action: /server{' '}
                            {server.isConnected ? 'disconnect' : 'connect'} {server.name}
                        </Text>
                    </Box>
                </Box>
            ))}
        </Box>
    );
} 