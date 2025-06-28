import React from 'react';
import {Text} from 'ink';
import BigText from 'ink-big-text';

export default function AsciiLogo() {
	return (
		<Text>
			<BigText colors={['white']} text="mcp use cli" />
		</Text>
	);
}
