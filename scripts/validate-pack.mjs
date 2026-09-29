#!/usr/bin/env node
/**
 * Validate the packaged artifact: it must contain exactly the public files
 * and no development paths. Shared by CI and the release workflow.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

const tarball = execFileSync("npm", ["pack", "--silent"], { encoding: "utf8" })
	.trim()
	.split("\n")
	.pop();
const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
	.trim()
	.split("\n")
	.map((line) => line.replace(/^package\//u, ""))
	.filter((line) => line.length > 0)
	.sort();
rmSync(tarball);

const expected = [
	"LICENSE",
	"README.md",
	"README.zh-CN.md",
	"client.js",
	"cordis.patch.yml",
	"package.json",
	"src/index.js",
	"src/nine-router-client.js"
];

const problems = [];
for (const file of expected) {
	if (!files.includes(file)) problems.push(`missing expected file: ${file}`);
}
for (const file of files) {
	if (
		file.startsWith("test/") ||
		file.startsWith(".github/") ||
		file.startsWith("node_modules/") ||
		file.startsWith("scripts/")
	) {
		problems.push(`forbidden file in package: ${file}`);
	}
}

if (problems.length > 0) {
	console.error(problems.join("\n"));
	process.exit(1);
}
console.log(`packaged artifact OK: ${files.length} files`);
