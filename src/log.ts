let enabled = false;

export const setDebug = (on: boolean) => {
	enabled = on;
};

/** `message` is built only when debug mode is on. */
export function log(message: () => string) {
	if (enabled) console.debug('[listwise]', message());
}
