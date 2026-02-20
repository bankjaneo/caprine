declare module 'sound-play' {
	function play(filePath: string, options?: {gain?: number; device?: string}): Promise<void>;
	export = play;
}
