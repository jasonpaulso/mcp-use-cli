import { Box, Text } from 'ink';
import React from 'react';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

interface ToolStatusProps {
    tools: Tool[];
    error?: string;
}

export function ToolStatus({ tools, error }: ToolStatusProps) {
    if (error) {
        return (
            <Box flexDirection="column" marginTop={1}>
                <Text color="red">❌ Error: {error}</Text>
                <Text >💡 This might indicate:</Text>
                <Box marginLeft={2} flexDirection="column">
                    <Text>• MCP servers failed to start</Text>
                    <Text>• Connection issues with configured servers</Text>
                </Box>
                <Text >Check console logs for more details.</Text>
            </Box>
        );
    }

    if (tools.length === 0) {
        return (
            <Box flexDirection="column" marginTop={1}>
                <Text color="yellow">❌ No MCP tools found</Text>
                <Text >💡 This suggests:</Text>
                <Box marginLeft={2} flexDirection="column">
                    <Text>• MCP servers failed to start or connect</Text>
                    <Text>• Server packages may not be installed</Text>
                </Box>
                <Text >🔍 Debug steps:</Text>
                <Box marginLeft={2} flexDirection="column">
                    <Text>1. Check console logs for errors</Text>
                    <Text>2. Test server manually: /test-server &lt;name&gt;</Text>
                    <Text>
                        3. Ask agent "Which tools do you have?" to see fallback tools
                    </Text>
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" marginTop={1}>
            <Text color="green">Found {tools.length} MCP tools:</Text>
            {tools.map((tool, index) => (
                <Box key={tool.name} flexDirection="column" marginTop={1}>
                    <Text>
                        {index + 1}. <Text bold>{tool.name || 'Unknown'}</Text>
                        {tool.description && `: ${tool.description}`}
                    </Text>
                </Box>
            ))}
        </Box>
    );
} 