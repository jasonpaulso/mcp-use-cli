import {Box, Text} from 'ink';
import Gradient from 'ink-gradient';
export const AsciiLogoContent = `
███╗   ███╗  ██████╗ ██████╗      ██╗   ██╗ ███████╗ ███████╗      ██████╗ ██╗      ██╗
████╗ ████║ ██╔════╝ ██╔══██╗     ██║   ██║ ██╔════╝ ██╔════╝     ██╔════╝ ██║      ██║
██╔████╔██║ ██║      ██████╔╝     ██║   ██║ ███████╗ █████╗       ██║      ██║      ██║
██║╚██╔╝██║ ██║      ██╔═══╝      ██║   ██║ ╚════██║ ██╔══╝       ██║      ██║      ██║
██║ ╚═╝ ██║ ╚██████╗ ██║          ╚██████╔╝ ███████║ ███████╗     ╚██████╗ ███████╗ ██║
╚═╝     ╚═╝  ╚═════╝ ╚═╝           ╚═════╝  ╚══════╝ ╚══════╝      ╚═════╝ ╚══════╝ ╚═╝
Vice CLI
  `;


export const AsciiLogo: React.FC = () => {
	let displayTitle;

	displayTitle = AsciiLogoContent;

	return (
		<Box
			marginBottom={1}
			alignItems="flex-start"
			flexShrink={0}
		>
			<Gradient name="vice" >
					<Text>{displayTitle}</Text>
				</Gradient>
		</Box>
	);
};