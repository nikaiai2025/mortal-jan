// On/off preferences kept in this browser: on unless the player turned them off.

export interface Setting {
	readonly enabled: boolean;
	set(enabled: boolean): void;
}

export function setting(key: string): Setting {
	let enabled = true;
	try {
		enabled = localStorage.getItem(key) !== "off";
	} catch {
		// storage unavailable
	}
	return {
		get enabled() {
			return enabled;
		},
		set(value) {
			enabled = value;
			try {
				localStorage.setItem(key, value ? "on" : "off");
			} catch {
				// storage unavailable: the choice lasts until the page is closed
			}
		},
	};
}
