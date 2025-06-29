import React, {useState, useEffect} from 'react';
import {Text} from 'ink';
import spinners from 'cli-spinners';
import type {SpinnerName} from 'cli-spinners';

type SpinnerProps = {
	/**
	 * Type of a spinner.
	 * See [cli-spinners](https://github.com/sindresorhus/cli-spinners) for available spinners.
	 *
	 * @default dots
	 */
	type?: SpinnerName | 'mcpuse';
};
const mcpuseSpinner = {
	interval: 80,
	frames: [
		"⠋",
		"⠙",
		"⠹",
		"⠸",
		"m",   // 5
		"⠼",
		"⠴",
		"⠦",
		"c",   // 9
		"⠧",
		"⠇",
		"⠏",
		"p",   // 13
		"⠋",
		"⠙",
		"⠹",
		"-",   // 17
		"⠸",
		"⠼",
		"⠴",
		"u",   // 21
		"⠦",
		"⠧",
		"⠇",
		"s",   // 25
		"⠏",
		"⠋",
		"⠙",
		"e"    // 29
	]
};



/**
 * Spinner.
 */
function Spinner({type = 'mcpuse'}: SpinnerProps) {
	const [frame, setFrame] = useState(0);
	let spinner;
	if (type === 'mcpuse') {
		spinner = mcpuseSpinner;
	} else {
		spinner = spinners[type];
	}

	useEffect(() => {
		const timer = setInterval(() => {
			setFrame(previousFrame => {
				const isLastFrame = previousFrame === spinner.frames.length - 1;
				return isLastFrame ? 0 : previousFrame + 1;
			});
		}, spinner.interval);

		return () => {
			clearInterval(timer);
		};
	}, [spinner]);

	return <Text>{spinner.frames[frame]}</Text>;
}

export default Spinner;
