import { execFileSync } from "node:child_process";

const expected = [
	"LICENSE",
	"README.md",
	"duck.png",
	"index.ts",
	"package.json",
];

let pack;
try {
	[pack] = JSON.parse(
		execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }),
	);
} catch (error) {
	console.error(`Could not inspect the npm package: ${error.message}`);
	process.exit(1);
}

const actual = pack.files.map(({ path }) => path).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
	process.stderr.write(
		`Unexpected npm package files.\nExpected: ${expected.join(", ")}\nActual: ${actual.join(", ")}\n`,
	);
	process.exitCode = 1;
}
