
import { Box, Text } from 'ink';
import React from 'react';

export const Footer = ({ servers, modelSlug }: { servers: any, modelSlug: string }) => {
    return (
        <Box flexDirection="row" justifyContent="space-between" paddingX={1} minWidth={25}>
            <Box justifyContent='flex-start' paddingX={1} minWidth={25}>
                {servers.length > 0 ? (
                    <Text>
                        {servers.map((server: any) => (
                            <Text key={server.name}>{server.name}</Text>
                        ))}
                    </Text>
                ) : (
                    <Text>No servers connected</Text>
                )}
            </Box>
            <Box justifyContent='flex-end' paddingX={1} minWidth={25}>
                <Text color="blue" bold>
                    Model:
                </Text>
                <Text color="white" >
                    {' '}{modelSlug.replace('/', ' ')}
                </Text>
            </Box>
        </Box>
    );
};