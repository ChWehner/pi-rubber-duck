import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { getPngDimensions, renderImage } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

/** Attribution for the artwork in duck.png. Text only; see duckGlyph for how it is drawn. */
export const DUCK_CREDIT = "Rubber duck emoji by Magnific";
const DUCK_FILE = new URL("./duck.png", import.meta.url);

let cachedPng: string | null | undefined;
const duckPng = (): string | null => {
	if (cachedPng === undefined) {
		try {
			cachedPng = readFileSync(DUCK_FILE).toString("base64");
		} catch {
			cachedPng = null;
		}
	}
	return cachedPng;
};

/**
 * The artwork, drawn with real pixels when the terminal speaks kitty or iTerm2.
 * Deliberately NOT used for the per-stretch widget: the sequence carries the whole
 * 21KB PNG, and the widget redraws every stretch. Credits only — one shot, on demand.
 * Block-art was measured and rejected too: at widget size the dark eye never survives
 * downsampling, so it renders as a yellow smear. Falls back to the glyph.
 */
export function duckGlyph(widthCells: number, heightCells = 1): string {
	const base64 = duckPng();
	if (!base64) return "🐤";
	const dimensions = getPngDimensions(base64);
	if (!dimensions) return "🐤";
	const drawn = renderImage(base64, dimensions, {
		maxWidthCells: widthCells,
		maxHeightCells: heightCells,
		preserveAspectRatio: true,
		moveCursor: false,
	});
	return drawn && drawn.rows <= heightCells ? drawn.sequence : "🐤";
}

/**
 * Where you stopped checking. A fixed word list, no semantics: it only decides WHICH of the
 * speaker's own sentences to hang in the air. Emphasis is the single bit the duck adds, and
 * it is the mechanism — you catch it when you hear yourself say "it should work".
 */
const HEDGES =
	/\b(obviously|clearly|of course|surely|somehow|for some reason|apparently|presumably|probably|should (?:be|work|return|have|already)|must be|has to be|can'?t be|i (?:assume|think|guess|believe)|seems? to|looks? (?:fine|right|correct)|always|never|just works)\b/i;

/** You do not find it at the end of the explanation. You find it mid-sentence. */
const MIN_STRETCHES = 3;

/** How much of what you just said is old news. */
const REPEAT_RATIO = 0.6;

const words = (text: string): Set<string> =>
	new Set(text.toLowerCase().match(/[a-z_]{4,}/g) ?? []);

/**
 * Asymmetric on purpose, and normalized by the CURRENT stretch: a long new stretch that merely
 * carries an earlier short one forward is exploring, not rehearsing.
 */
function repeatsEarlier(prior: string[], explanation: string): boolean {
	const now = words(explanation);
	if (now.size < 8) return false;
	return prior.some((p) => {
		const before = words(p);
		const shared = [...now].filter((w) => before.has(w)).length;
		return shared / now.size >= REPEAT_RATIO;
	});
}

const params = Type.Object({
	explanation: Type.String({
		minLength: 1,
		description:
			"One stretch of your explanation, out loud, in prose. Narrate the path: what each step is supposed to do, what it actually does, and the concrete values. Do not summarize the boring parts — that is where it lives. Do not stop when it gets awkward. If the next claim needs an observation you do not have, stop and set exit rather than guessing it.",
	}),
	exit: Type.Optional(
		StringEnum(["found_it", "must_measure", "exhausted"], {
			description:
				"Leave exit unset for another stretch. found_it: the explanation stalled on the cause and you can name it. must_measure: the next claim needs an observation you do not have — leave and measure it. exhausted: you narrated the whole path and surfaced neither a cause nor a thing to measure.",
		}),
	),
});

export type RubberDuckInput = Static<typeof params>;

const clip = (text: string, max = 96): string =>
	text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

const sentences = (text: string): string[] =>
	text
		.split(/(?<=[.!?]["')\]]?)\s+|\n+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

/**
 * Pure. While listening, the duck only returns the speaker's own words and does not stop.
 * A single directive appears at the exits — by then talking is over, so it cannot short-circuit it.
 * `prior` = stretches already said this session.
 */
export function quack(
	prior: string[],
	explanation: string,
	exit?: RubberDuckInput["exit"],
): { text: string; done: boolean } {
	const current = sentences(explanation);
	const earlier = prior.flatMap(sentences);
	const still = ["🐤", "", "The duck has not moved.", ""];
	const longEnough = prior.length >= MIN_STRETCHES - 1;
	const stop = (line: string) => ({
		text: [...still, line].join("\n"),
		done: true,
	});

	// No floor here: hitting an unsayable claim early and leaving to measure is correct, not impatient.
	if (exit === "must_measure") {
		return stop("Go measure it.");
	}
	if (exit === "found_it" && longEnough) {
		return stop("Verify it before editing.");
	}
	if (
		(exit === "exhausted" && longEnough) ||
		repeatsEarlier(prior, explanation)
	) {
		return stop("Talking is done. Read the path or instrument it.");
	}

	// Your own words, hanging in the air. Never the duck's words.
	// Falls back to your opening framing, which is the assumption you walked in with.
	const echo =
		current.find((s) => HEDGES.test(s)) ?? earlier[0] ?? current.at(-1);

	return {
		text: [
			"🐤",
			"",
			echo ? `"...${echo}..."` : "",
			"",
			"Keep explaining.",
		].join("\n"),
		done: false,
	};
}

/** What the human watches while the model meanders. The last sentence is where the meander currently is. */
export function watchingLines(
	stretchNo: number,
	explanation: string,
): string[] {
	const here = sentences(explanation).at(-1) ?? explanation;
	return [
		`🐤 stretch ${stretchNo}`,
		`  ${clip(here)}`,
		"  Your message arrives before the next stretch.",
	];
}

export const TOOL_DESCRIPTION =
	"Call this the moment any of these is true: (1) your first fix for this failure did not hold; (2) you just made a claim about behavior you have not observed — should, must, obviously, probably, seems fine; (3) you are about to change several callers or files, or run something expensive; (4) you have read the same file twice without learning anything new; (5) you can state the result you want but cannot predict the next concrete value. Then explain the problem out loud to an inanimate object, one stretch per call, in prose. The duck does not answer, react, or help — talking is the whole mechanism, and the cause usually surfaces mid-sentence, not at the end. Keep calling it; a stretch that surfaces nothing is normal. Set exit only when one of its cases fits.";

/**
 * Trigger (1) is the highest-yield one and a model never notices it on its own — measured:
 * a prompt saying "I already added a retry and it still happened" produced zero duck calls.
 * So make the trigger legible at the moment it is true. This nudges; it never blocks.
 *
 * Persistence alone is enough. Otherwise a remedy AND a persistence marker must both appear,
 * because "fix" or "tried" on their own are ordinary requests, not reports of a failed fix.
 * Measured against a 36-phrase corpus: 22/22 fire, 14/14 stay quiet.
 */
const PERSISTS =
	/\b(still (?:happen|happening|fail|failing|fails|break|breaking|broken|occur|occurs|occurring|error|errors|reproduc)|keeps? (?:happening|failing|breaking|occurring|coming back)|(?:it'?s|is) back\b|(?:happening|failing|broke|failed) again|same (?:bug|error|issue|problem) again|regress(?:ed|ion)|did ?n[o']?t (?:work|hold|help|fix)|does ?n[o']?t (?:work|help)|no change after|not fixed\b|(?:already )?tried (?:that|it|this)\b|(?:second|third|fourth|another|\d+(?:st|nd|rd|th)) (?:attempt|try|time))/i;
const REMEDY =
	/\b(fix|fixed|fixes|patch|patched|retry|retries|retried|workaround|reverted|reapplied|redeploy(?:ed)?|attempt|tried|mitigation)\b/i;
const PERSISTED =
	/\b(still|again|worse|no change|back|broken|surviv(?:e|ed|es|ing)|regress|stopped working|did ?n[o']?t)\b/i;

/** True when the user is reporting that a previous fix did not hold. */
export const fixDidNotHold = (text: string): boolean =>
	PERSISTS.test(text) || (REMEDY.test(text) && PERSISTED.test(text));

export default function (pi: ExtensionAPI) {
	// ponytail: one duck per extension instance. Two concurrent duck calls in one assistant message
	// would share this history and race for the widget; split per toolCallId if that ever happens.
	let said: string[] = [];
	const reset = () => {
		said = [];
	};
	pi.on("session_start", reset);
	// Say it once, at the moment it is true. The model remains free to ignore it.
	pi.on("before_agent_start", (event) => {
		if (!fixDidNotHold(event.prompt)) return;
		return {
			systemPrompt: `${event.systemPrompt}\n\nA previous fix for this failure did not hold. That is rubber_duck trigger (1). Explain the problem to the duck before proposing another fix.`,
		};
	});
	// The duck is only listening during a turn; never leave it on screen afterwards.
	pi.on("agent_settled", (_event, ctx) => {
		ctx.ui.setWidget("rubber-duck", undefined);
		reset();
	});

	pi.registerTool({
		name: "rubber_duck",
		label: "Rubber Duck",
		description: TOOL_DESCRIPTION,
		parameters: params,
		async execute(_id, input: RubberDuckInput, _signal, _onUpdate, ctx) {
			const { text, done } = quack(said, input.explanation, input.exit);
			said.push(input.explanation);
			const stretches = said.length;
			// This duck is done. A further call is a new conversation, not a resumed one.
			if (done) said = [];
			// Nothing to watch once the duck stops listening, and the model keeps
			// working for a long time after: a done frame would sit there stale
			// until the whole run settles. The transcript already holds the ending.
			if (ctx.hasUI) {
				ctx.ui.setWidget(
					"rubber-duck",
					done ? undefined : watchingLines(stretches, input.explanation),
				);
			}
			return {
				content: [{ type: "text", text }],
				details: { stretches, done },
			};
		},
	});

	pi.registerCommand("duck-credits", {
		description: "Show the duck artwork credit",
		handler: async (_args, ctx) => {
			ctx.ui.setWidget("rubber-duck", [
				duckGlyph(12, 6),
				"",
				`  ${DUCK_CREDIT}`,
			]);
			ctx.ui.notify(DUCK_CREDIT, "info");
		},
	});

	pi.registerCommand("duck", {
		description: "Ask the model to debug the current problem with the duck",
		handler: async () => {
			pi.sendUserMessage(
				"Stop and take the problem you are working on right now to the rubber_duck tool, one stretch per call. No edits while the duck is listening.",
				{ deliverAs: "followUp" },
			);
		},
	});
}
