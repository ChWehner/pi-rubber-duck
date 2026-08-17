import { glob, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = process.cwd();
const maskNonCode = (source) => {
	let result = "";
	let state = "code";

	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		const next = source[index + 1];
		const blank = () => (character === "\n" ? "\n" : " ");

		if (state === "code") {
			if (character === "/" && next === "/") {
				state = "line-comment";
				result += "  ";
				index += 1;
			} else if (character === "/" && next === "*") {
				state = "block-comment";
				result += "  ";
				index += 1;
			} else if (
				character === "/" &&
				/[=(:,[!&|?;{}]/.test(result.trimEnd().at(-1) ?? "")
			) {
				state = "regular-expression";
				result += " ";
			} else if (character === "'") {
				state = "single-quote";
				result += " ";
			} else if (character === '"') {
				state = "double-quote";
				result += " ";
			} else if (character === "`") {
				state = "template";
				result += " ";
			} else {
				result += character;
			}
			continue;
		}

		result += blank();
		if (state === "line-comment" && character === "\n") state = "code";
		if (state === "block-comment" && character === "*" && next === "/") {
			result += " ";
			index += 1;
			state = "code";
		}
		if (state === "regular-expression" && character === "[")
			state = "regex-class";
		if (state === "regex-class" && character === "]")
			state = "regular-expression";
		if (state === "regular-expression" && character === "/") state = "code";
		if (
			(state === "single-quote" && character === "'") ||
			(state === "double-quote" && character === '"') ||
			(state === "template" && character === "`")
		) {
			state = "code";
		}
		if (character === "\\" && state !== "line-comment") {
			result += next === "\n" ? "\n" : " ";
			index += 1;
		}
	}

	return result;
};

const lineAt = (source, offset) => source.slice(0, offset).split("\n").length;
const markers = [
	/\.\s*(only|skip)\s*\(/g,
	/(?:[,{]\s*)(only|skip)\s*:\s*true\b/g,
];
const failures = [];

for await (const file of glob("**/*.test.ts", {
	cwd: root,
	exclude: ["node_modules/**", ".git/**"],
})) {
	const absoluteFile = resolve(root, file);
	const source = await readFile(absoluteFile, "utf8");
	const code = maskNonCode(source);

	for (const pattern of markers) {
		for (const match of code.matchAll(pattern)) {
			failures.push(
				`${relative(root, absoluteFile)}:${lineAt(source, match.index)}: prohibited ${match[1]} marker`,
			);
		}
	}
}

if (failures.length > 0) {
	process.stdout.write(`${failures.join("\n")}\n`);
	process.exitCode = 1;
}
