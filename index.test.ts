import assert from "node:assert/strict";
import { test } from "node:test";
import install, {
	type RubberDuckInput,
	TOOL_DESCRIPTION,
	fixDidNotHold,
	quack,
	watchingLines,
} from "./index.ts";

type WidgetUpdate = { key: string; content: string[] | undefined };
type WidgetContext = {
	hasUI: boolean;
	ui: {
		setWidget(key: string, content: string[] | undefined): void;
		notify(message: string, type: "info"): void;
	};
};
type DuckTool = {
	execute(
		id: string,
		input: RubberDuckInput,
		signal: AbortSignal,
		onUpdate: () => void,
		ctx: WidgetContext,
	): Promise<unknown>;
};
type DuckCommand = { handler(args: string, ctx: WidgetContext): Promise<void> };
type EventHandler = (event: unknown, ctx: WidgetContext) => void;

function installDuck() {
	const widgetUpdates: WidgetUpdate[] = [];
	const handlers = new Map<string, EventHandler>();
	let duckTool: DuckTool | undefined;
	let credits: DuckCommand | undefined;
	const ctx: WidgetContext = {
		hasUI: true,
		ui: {
			setWidget(key, content) {
				widgetUpdates.push({ key, content });
			},
			notify() {},
		},
	};

	install({
		on(event: string, handler: EventHandler) {
			handlers.set(event, handler);
		},
		registerTool(tool: DuckTool) {
			duckTool = tool;
		},
		registerCommand(name: string, command: DuckCommand) {
			if (name === "duck-credits") credits = command;
		},
	} as unknown as Parameters<typeof install>[0]);

	const tool = duckTool;
	const creditCommand = credits;
	assert.ok(tool);
	assert.ok(creditCommand);
	return {
		widgetUpdates,
		call: (input: RubberDuckInput) =>
			tool.execute("test", input, new AbortController().signal, () => {}, ctx),
		showCredits: () => creditCommand.handler("", ctx),
		settleAgent: () => handlers.get("agent_settled")?.({}, ctx),
		resetSession: () => handlers.get("session_start")?.({}, ctx),
	};
}

test("hangs your own hedged sentence in the air, with no commentary", () => {
	const { text } = quack(
		[],
		"handleLogin calls auth. The token should be non-null here. Then we decode it.",
	);
	assert.match(text, /"\.\.\.The token should be non-null here\.\.\.\."/);
	assert.doesNotMatch(text, /decode/);
	assert.doesNotMatch(text, /suspect|wrong|verify|rehears/i);
});

test("never accepts an epiphany on the first stretch", () => {
	const { text, done } = quack([], "Oh, auth returns undefined.", "found_it");
	assert.match(text, /Keep explaining/);
	assert.equal(done, false);
});

test("still refuses on the second stretch, accepts on the third", () => {
	assert.equal(quack(["one."], "two.", "found_it").done, false);
	assert.equal(quack(["one.", "two."], "three.", "found_it").done, true);
});

test("accepts the epiphany once the explanation has run its length", () => {
	const { text } = quack(
		["one.", "two."],
		"auth never awaited its promise.",
		"found_it",
	);
	assert.match(text, /Verify it before editing/);
});

test("lets you leave to measure immediately, with no floor", () => {
	const { text, done } = quack(
		[],
		"I cannot say what the cache holds at boot.",
		"must_measure",
	);
	assert.match(text, /Go measure it/);
	assert.equal(done, true);
});

test("exhausted sends you to read or instrument, not to edit", () => {
	const { text } = quack(
		["one.", "two."],
		"That is the whole path, end to end.",
		"exhausted",
	);
	assert.match(text, /Read the path or instrument it/);
});

test("repeating an earlier stretch ends it without being asked", () => {
	const stretch =
		"handleLogin awaits auth which reads the cached signing key that the background timer refreshes every interval.";
	assert.equal(quack([stretch], `${stretch} Same thing again.`).done, true);
});

test("a long new stretch merely carrying a short one forward is exploring, not rehearsing", () => {
	const short = "The timer refreshes the key.";
	const long =
		"The timer refreshes the key, but production runs four replicas behind a balancer, each holding an independent offset that drifts apart after every deploy.";
	assert.equal(quack([short], long).done, false);
});

test("a short restatement of a long stretch is too short to judge", () => {
	const long =
		"Production runs four replicas behind a balancer, each holding an independent timer offset that drifts.";
	assert.equal(quack([long], "Replicas drift.").done, false);
});

test("ordinary prose quoting the duck cannot fake the done state", () => {
	const { done } = quack(
		[],
		"I keep waiting but the duck has not moved at all, which is unsettling.",
	);
	assert.equal(done, false);
});

test("with no hedge, reflects your opening framing back", () => {
	const { text } = quack(
		["The cache is warm at boot. We then read the row and map it."],
		"Production runs four replicas behind a balancer.",
	);
	assert.match(text, /The cache is warm at boot/);
});

test("first stretch with no hedge reflects its own last sentence", () => {
	const { text } = quack([], "We read the row. Then we map it.");
	assert.match(text, /Then we map it/);
});

test("a whitespace-only stretch never fabricates an empty quote", () => {
	const { text } = quack([], "   ");
	assert.doesNotMatch(text, /"\.\.\./);
	assert.match(text, /Keep explaining/);
});

test("terminal punctuation inside a closing quote still ends the sentence", () => {
	const { text } = quack(
		[],
		'The docs say "it is always safe." Then we retry.',
	);
	assert.match(text, /"\.\.\.The docs say "it is always safe\."\.\.\."/);
});

test("the watch surface shows where the meander is, plus the way in", () => {
	const lines = watchingLines(
		"We read the row. The timer offset is per replica.",
	);
	assert.equal(lines[0], "🐤");
	assert.doesNotMatch(lines.join("\n"), /stretch \d/);
	assert.match(lines[1], /timer offset is per replica/);
	assert.equal(lines[2], "  Say something anytime.");
});

test("a long sentence is clipped so the widget cannot grow", () => {
	const lines = watchingLines(`${"word ".repeat(60)}end.`);
	assert.ok(lines[1].length <= 100, lines[1].length.toString());
	assert.match(lines[1], /…$/);
});

test("the widget stays for 30 seconds, then exits and clears", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const duck = installDuck();

	await duck.call({ explanation: "The first explanation." });
	duck.settleAgent();
	t.mock.timers.tick(29_999);
	assert.equal(duck.widgetUpdates.length, 1);
	t.mock.timers.tick(1);
	assert.equal(duck.widgetUpdates.length, 2);
	assert.equal(duck.widgetUpdates.at(-1)?.key, "rubber-duck");
	assert.ok(duck.widgetUpdates.at(-1)?.content);
	t.mock.timers.tick(500);
	assert.deepEqual(duck.widgetUpdates.at(-1), {
		key: "rubber-duck",
		content: undefined,
	});
});

test("a later duck update resets the timeout and defeats an earlier exit", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const duck = installDuck();

	await duck.call({ explanation: "The first explanation." });
	t.mock.timers.tick(29_999);
	await duck.call({ explanation: "The second explanation." });
	t.mock.timers.tick(1);
	assert.equal(duck.widgetUpdates.length, 2);
	t.mock.timers.tick(29_998);
	assert.equal(duck.widgetUpdates.length, 2);
	t.mock.timers.tick(1);
	assert.equal(duck.widgetUpdates.length, 3);
	await duck.call({ explanation: "The third explanation." });
	t.mock.timers.tick(500);
	assert.notEqual(duck.widgetUpdates.at(-1)?.content, undefined);
});

test("final calls, session reset, and credits cancel delayed duck cleanup", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const duck = installDuck();

	await duck.call({ explanation: "The first explanation." });
	await duck.showCredits();
	const credit = duck.widgetUpdates.at(-1);
	t.mock.timers.tick(30_500);
	assert.deepEqual(duck.widgetUpdates.at(-1), credit);

	await duck.call({ explanation: "The next explanation." });
	await duck.call({
		explanation: "I need a measurement.",
		exit: "must_measure",
	});
	assert.equal(duck.widgetUpdates.at(-1)?.content, undefined);
	const afterFinal = duck.widgetUpdates.length;
	t.mock.timers.tick(30_500);
	assert.equal(duck.widgetUpdates.length, afterFinal);

	await duck.call({ explanation: "One more explanation." });
	duck.resetSession();
	assert.equal(duck.widgetUpdates.at(-1)?.content, undefined);
	const afterReset = duck.widgetUpdates.length;
	t.mock.timers.tick(30_500);
	assert.equal(duck.widgetUpdates.length, afterReset);
});

test("the description leads with when to call, not what it is", () => {
	assert.match(TOOL_DESCRIPTION, /^Call this/);
	assert.equal(TOOL_DESCRIPTION.match(/\(\d\)/g)?.length, 5);
});

test("the description does not restate what the exit enum owns", () => {
	for (const name of ["found_it", "must_measure", "exhausted"]) {
		assert.ok(
			!TOOL_DESCRIPTION.includes(name),
			`description duplicates ${name}`,
		);
	}
});

test("the description never tells the model to trust a feeling", () => {
	assert.doesNotMatch(TOOL_DESCRIPTION, /feels?\b|feeling/i);
});

test("no prompt ships stray whitespace to the model", () => {
	assert.doesNotMatch(TOOL_DESCRIPTION, /\n|\t| {2}/);
});

test("the nudge fires when a previous fix did not hold", () => {
	for (const s of [
		"I already added a retry and it still happened last night",
		"I fixed it yesterday but it's back",
		"my fix made it worse",
		"I patched it and the bug survived",
		"the workaround stopped working",
		"tried that already",
	]) {
		assert.ok(fixDidNotHold(s), `should fire: ${s}`);
	}
});

test("the nudge stays quiet on ordinary requests", () => {
	for (const s of [
		"I already added tests for that",
		"fix the failing test I just wrote",
		"add a retry to this function",
		"the server stopped working",
		"review my patch",
	]) {
		assert.ok(!fixDidNotHold(s), `should stay quiet: ${s}`);
	}
});
