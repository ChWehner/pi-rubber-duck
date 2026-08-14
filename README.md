<p align="center">
  <img src="duck.png" alt="Rubber duck" width="140">
</p>

# pi-rubber-duck

A rubber duck for your coding agent.

The model explains its problem out loud, one stretch at a time, to something that
never answers. Reading code is recognition. Explaining it is generation. The bug
usually turns up mid sentence, at the point where the next sentence refuses to be
written.

```text
🐤

"...the token should be non-null here..."

Keep explaining.
```

The duck said nothing. It quoted you.

## Why the duck stays quiet

There is a strong pull to make this thing smarter, so that it analyses the
explanation, suggests causes and grades the evidence. All of that breaks it. The
moment the duck says anything worth reacting to, the model stops talking and
starts replying, and replying is what was already going wrong.

So the duck only does three things.

1. It stays present, so the model keeps going.
2. It hands back one of the model's own sentences, picked but never reworded.
3. It refuses to stop early, because giving up after two sentences is how duck
   debugging fails.

No LLM calls, no network, and every response is deterministic.

## Install

```bash
git clone https://github.com/ChWehner/pi-rubber-duck.git \
  ~/.pi/agent/extensions/rubber-duck
```

Or install it as a pi package.

```bash
pi install git:github.com/ChWehner/pi-rubber-duck
```

Then restart pi, or run `/reload`.

## How the loop works

The model calls `rubber_duck` over and over, one stretch of explanation per call.
Each call runs these checks in order and the first match wins.

| #   | Condition                                                         | Result                                                   |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | `exit` is `must_measure`                                          | Stop. "Go measure it." No minimum, on purpose            |
| 2   | `exit` is `found_it`, third call or later                         | Stop. "Verify it before editing."                        |
| 3   | `exit` is `exhausted` third call or later, or repetition shows up | Stop. "Talking is done. Read the path or instrument it." |
| 4   | anything else                                                     | Keep listening. Echo plus "Keep explaining."             |

There are three ways out rather than one. With a single exit, any session that
does not end in a revelation has to invent one. The most common honest ending is
`must_measure`, where the next thing the model would say needs a value it does
not have. That one has no minimum, because leaving to go and measure on the first
sentence is the right move rather than an impatient one.

There is no turn cap. A cap only teaches the model to pay a fixed toll of N
calls. The loop ends on repetition instead. Once a stretch is roughly 60 percent
old words, the model is rehearsing rather than exploring and the ground is
already covered. Repetition is the one ending the duck can spot by itself,
because you cannot measure insight from the outside but you can measure
rehearsal.

## Which sentence it hands back

Four rules, first hit wins.

1. A sentence with a hedge in it, such as obviously, should return, must be,
   seems fine or somehow. That is where the model stopped checking.
2. Otherwise the opening framing, which is the assumption it walked in with.
3. Otherwise its own last sentence.
4. Otherwise nothing at all. A blank stretch does not get an invented quote.

## What you see, and getting a word in

A widget above the editor, refreshed on every stretch and cleared the moment the
duck stops listening, so it never sits there stale while the model works on.

```text
🐤 stretch 3
  The timer offset is per replica, so four pods drift independently.
  Type anything to interject ✏️. It lands before the next stretch 🛬.
```

Interjections use pi's own steering. Type while the model is working and your
message arrives between stretches. The duck holds no lock and cannot force
another call, which is exactly why you can always get a word in. Esc still stops
everything.

## When it fires

The triggers are events rather than feelings. Feeling stuck is not observable,
and models tend to feel stuck when they are calm and close to the answer, not
while confidently shipping a bad fix.

1. The first fix for this failure did not hold.
2. The model just claimed something about behaviour it has not observed, using
   words like should, must, obviously, probably or seems fine.
3. It is about to change several callers or files, or run something expensive.
4. It has read the same file twice without learning anything new.
5. It can state the result it wants but cannot predict the next concrete value.

The first trigger is also picked up from your own message. Say something like "I
patched it and the bug survived" and one extra sentence goes into that turn's
system prompt, pointing at the duck. It nudges and never blocks, and when nothing
matches, the turn is byte for byte the same as having no hook at all.

That hook exists because of a measurement. A prompt saying "I already added a
retry and it still happened" produced zero duck calls from the tool description
alone. With the nudge, the same prompt produced three. The detector gets 22 out
of 22 on phrasings that should fire, and 14 out of 14 on ordinary requests that
should stay quiet.

## Commands

| Command         | Effect                                                     |
| --------------- | ---------------------------------------------------------- |
| `/duck`         | Hand the current problem to the duck, one stretch per call |
| `/duck-credits` | Show the artwork credit                                    |

## Development

```bash
node --test index.test.ts
```

23 tests, no framework and no fixtures. All of the logic sits in pure exported
functions, so the tests need no harness and no mocks. The prompts get tested too.
The tool description has to lead with the trigger list, avoid repeating what the
`exit` enum already says, and never ship stray whitespace to the model.

## Credits

[Rubber duck artwork](duck.png) by Magnific.

Built with [pi](https://github.com/badlogic/pi-mono).

## Licence

MIT, Christoph Wehner.
