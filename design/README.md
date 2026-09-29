# Design: RP01 prototype

A clickable prototype for radioforthepeople.org, styled after Dieter Rams's work for Braun (T3 pocket radio, T1000 world receiver).

Open `index.html` in a browser. It is a single self-contained file with no build step. It needs a network connection only for the Google Fonts.

## Concept

The site is one radio. The hero is a flat Braun-style receiver with a speaker grille, a Live / Archive band switch, a dial, show buttons and a play button. Everything else on the page sits quietly below it.

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

Each show gets one colour from the same palettes (`#AAB7BF`, `#ED8008`, `#BF1B1B`, `#261201`, `#736356`, `#BFB1A8`, `#AD1D1D`, `#D9D2C6`, `#736B1E`). It appears on the show's button, its marker on the dial, its dot in every list, and the centre hole of its mark on the show page. A host's own new show gets the live orange.

Dark mode uses deep browns with the same accents. All colours are CSS custom properties at the top of `index.html`.

## Type

- **Schibsted Grotesk** for headings and body text, with a lowercase wordmark: "radio for the people"
- **DM Mono** for frequencies, times and labels

## Style rules

- Flat: no shadows, gradients or bevels. Selection is shown with a thin ring or a solid fill.
- Orange means live. It isn't used for decoration.
- Model label in the corner of the device: "radio for the people … RP01".

## How listening works

Shows, not frequencies. A host creates a show, picks a day and time, and goes live at that time. Recordings can be kept in the archive.

- **Homepage default:** pressing play gives you the most popular live show. If nobody is live, the radio plays from the archive, and the display says when the next live show starts.
- **Band switch (Live / Archive):** works like the band selector on a world receiver. The Live band holds the shows on air now. The Archive band holds the latest recording of each show. When nobody is live, the Live position is disabled.
- **Dial and buttons:** each show on the current band has a spot on the dial and a round button in its colour. Between shows there is static. The button labels are the time a live show started, or the date of a recording.
- **Another show:** jumps to a random different show on the current band, for when you don't have a particular show in mind.
- **Readout:** for a live show, how long it has been on air. For a recording, the playback position and the total length.

## What the prototype shows

- **Listen:** the radio described above. The link under the radio previews the homepage when nobody is live.
- **Search:** filters the live, upcoming and archive lists by show, host, city or topic.
- **On air now, Coming up, From the archive:** the three ways into a show. Listen, Remind me and Play all drive the radio.
- **Show pages:** every show has its own address (e.g. `radioforthepeople.org/night-bus`, `#night-bus` in the prototype). The page shows the show's mark (the logo with the show's colour in the centre), its schedule, its next date, a listen or play button, and its recordings.
- **Host your own show:** name the show (the page address is previewed), pick a day, time and repeat, and choose whether to keep recordings. **Schedule show** adds it to Coming up. **Go live now** puts it on the Live band. Ending the show adds the recording to the archive and to the show page.

## What is simulated

- All shows, hosts, schedules, recordings, plays and listener counts are example data. The prototype pretends it is 19:47 on Tuesday 29 September.
- Nothing is saved. Scheduled shows, reminders and recordings reset when the page reloads.
- Station audio is generated in the browser with the Web Audio API: pads, arpeggios, a groove, and filtered "talk" that sounds like voices through a wall. No real streams are played.
- The mic level meter on the broadcast desk is simulated. Nothing is recorded or sent anywhere.
