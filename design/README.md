# Design: RP01 prototype

A clickable prototype for radioforthepeople.org, styled after Dieter Rams's work for Braun (T3 pocket radio, T1000 world receiver).

Open `index.html` in a browser. It is a single self-contained file with no build step. It needs a network connection only for the Google Fonts.

## Concept

The site is one radio. The hero is a flat Braun-style receiver with a speaker grille, an FM dial, station buttons and a play button. Everything else on the page sits quietly below it.

**The speaker is the logo.** The mark is a speaker grille: six rings of round holes with one orange hole in the centre, standing for one voice with the listeners around it. The same pattern is used at every size, from the favicon (`logo.svg`) to the full speaker in the hero. When the radio plays, the holes swell and light up orange with the sound: bass moves the inner rings and treble the outer ones.

## Palette

Taken from the Dieter Rams palettes DR01 and DR06.

| Role | Hex |
| --- | --- |
| Radio body / panels | `#D9D2C6` |
| Page ground | `#E9E7E1` |
| Text | `#261201` |
| Secondary text | `#736356` |
| Lines | `#BFB1A8` |
| Live / on air (used only for this) | `#ED3F1C` |

Station colours are drawn from the same palettes: `#AAB7BF`, `#ED8008`, `#736B1E`, `#BF1B1B`, `#D9D2C6`, `#261201`. Each station keeps its colour on its button, its marker on the dial and its dot in the list.

Dark mode uses deep browns with the same accents. All colours are CSS custom properties at the top of `index.html`.

## Type

- **Schibsted Grotesk** for headings and body text, with a lowercase wordmark: "radio for the people"
- **DM Mono** for frequencies, times and labels

## Style rules

- Flat: no shadows, gradients or bevels. Selection is shown with a thin ring or a solid fill.
- Orange means live. It isn't used for decoration.
- Model label in the corner of the device: "radio for the people … RP01".

## What the prototype shows

- **Listen:** drag the dial (or use the scroll wheel over it) and press the station buttons. Stations fade in and out of static as you tune past them.
- **On air now:** the live shows with listener counts. **Tune in** sweeps the dial to that station.
- **Later tonight:** the evening schedule with reminder toggles.
- **Host your own show:** three steps and a broadcast desk. **Go on air** gives your show a free frequency, and it appears on the dial and in the list.

## What is simulated

- All stations, hosts, schedules and listener counts are example data.
- Station audio is generated in the browser with the Web Audio API: pads, arpeggios, a groove, and filtered "talk" that sounds like voices through a wall. No real streams are played.
- The mic level meter on the broadcast desk is simulated. Nothing is recorded or sent anywhere.
