type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** Minimal element builder: h("button", { class: "x", onclick }, "text"). */
export function h<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Props = {},
	...children: Child[]
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	for (const [key, value] of Object.entries(props)) {
		if (value === undefined || value === null || value === false) continue;
		if (key.startsWith("on") && typeof value === "function") {
			element.addEventListener(key.slice(2), value as EventListener);
		} else if (key === "class") {
			element.className = String(value);
		} else if (key === "style" && typeof value === "object") {
			Object.assign(element.style, value);
		} else if (key in element && !key.includes("-")) {
			(element as unknown as Props)[key] = value;
		} else {
			element.setAttribute(key, value === true ? "" : String(value));
		}
	}
	append(element, children);
	return element;
}

export function append(parent: Node, children: Child[]): void {
	for (const child of children) {
		if (child === null || child === undefined || child === false) continue;
		parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
	}
}

/** Replace the children of `root`, skipping empty entries. */
export function replace(root: Element, ...children: Child[]): void {
	root.replaceChildren();
	append(root, children);
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
