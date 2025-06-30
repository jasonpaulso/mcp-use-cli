import {Box, Text} from 'ink';
import Link from 'ink-link';
import React from 'react';

export const Footer = ({
	servers,
	modelSlug,
}: {
	servers: string[];
	modelSlug: string;
}) => {
	return (
		<Box
			flexDirection="row"
			justifyContent="space-between"
			paddingX={1}
			minWidth={25}
			marginX={1}
			marginTop={1}
			marginBottom={1}
		>
			<Box justifyContent="flex-start" paddingX={1} minWidth={25}>
				{servers.length > 0 ? (
					<>
						<Text color="green">● </Text>
						<Text>
							{servers.length} Server{servers.length > 1 ? 's' : ''} Connected
						</Text>
					</>
				) : (
					<Text>No servers connected</Text>
				)}
			</Box>
			<Box>
				<Link url="https://discord.com/invite/XkNkSkMz3V" fallback={true}>
					<Text underline>Support</Text>
				</Link>
			</Box>
			<Box justifyContent="flex-end" paddingX={1} minWidth={25}>
				<Text color="blue" bold>
					Model:
				</Text>
				<Text color="white"> {modelSlug.replace('/', ' ')}</Text>
			</Box>
		</Box>
	);
};
