# One-Tap Skyline · 一指盖楼：城市天际线

[简体中文](README.md) · **English**

**One finger. One tower. A city built together.**

One-Tap Skyline is an open-source tower stacking browser game for live events, exhibitions and team gatherings. Players scan a QR code on their phones, stack moving floors with one finger and compete for a place in a shared 3D coastal city and leaderboard on the big screen. No app download or account registration is required.

[Screenshots](#start-with-an-open-city) · [How to play](#build-with-one-finger) · [Self-hosting](#run-your-own-event) · [Feedback and deployment support](#feedback-and-deployment-support) · [FAQ](#frequently-asked-questions)

## Start with an open city

Streets, parks, a fairground and waterfronts are ready for everyone’s towers. The display shows the day’s city and leaderboard, with an automatic camera tour, manual orbit and zoom, building-name search and district navigation.

![One-Tap Skyline 3D coastal city on the big screen before player towers arrive](docs/images/city-initial.png)

*Illustrative initial scene with no player towers. The QR code shown is for illustration; scan the current code at your event to join.*

## Build with one finger

Floors alternate between sideways and front-to-back movement, using only one axis at a time. Tap to place a floor; overhanging parts are cut away. Accurate landings leave more room for the next floor. Ordinary landings, Perfects and misses have distinct visual and audio feedback.

<p align="center">
  <img src="docs/images/phone-gameplay.png" width="320" alt="One-Tap Skyline tower stacking gameplay in a phone-sized simulation, showing 16 floors">
</p>

*Phone-sized simulation of the running game. The floor count and remaining time come from this simulated round.*

1. **Scan the event QR code** to open today’s game.
2. **Tap to catch each floor.** Build for up to 60 seconds of active play; a miss ends the round early.
3. **Make the tower yours** with a name, a color and an optional photo.
4. **Find it on the big screen** using the leaderboard or building search.

## Every tower has its own character

- **Your floor count is your score.** Perfects and combos provide feedback without adding extra floors.
- **Keep building higher.** Your best result is retained for the day in the same browser. Lower or equal scores do not replace it. A displayed tower stays on its plot when a new personal best replaces it with the complete new tower.
- **Choose your look.** On your first result or a new personal best, change the name, choose from six colors and optionally add a photo. Photos can be previewed, replaced or withdrawn; uploading is optional.
- **Enjoy the skyline.** Towers have different decorations at different heights, and the top three leaderboard ranks receive special rooftop ornaments.

Names and saved photos are publicly displayed. Choose content you are happy to share with the event. Anonymous identity lasts for the day in the same browser; a different browser or device is treated as a separate participant.

## Fill the island together

Six districts provide 76 display plots. Every valid personal best is saved, while the highest-scoring 76 towers appear in the city. Earlier achievement takes priority when equal scores compete for a plot; leaderboard ranks may be tied. Towers outside the display remain available on the phone and can compete again with a better score.

![Shared 3D city and leaderboard filled with 76 simulated towers](docs/images/city-full-simulated.png)

***Simulated data: 76 sample towers fill the display plots. Names, scores and rankings are illustrative and do not represent real participants or event results.***

With moving cars and a slowly turning Ferris wheel, the display becomes both a leaderboard and a city scene created together.

## A fresh skyline every day

At 00:00 Beijing time, the city, scores, towers, photos and anonymous identities reset, and the participation QR code changes.

Keep the complete page opened from the QR code to refresh or play again that day. On the next day, scan the new event code and help build a new city.

## Run your own event

The game supports **Docker self-hosting** for your own QR-code participation page and city display. It uses **TypeScript, Three.js (WebGL), Node.js and SQLite**. Follow the [deployment guide](docs/deployment.md) to set up an event, or the [local practice instructions](CONTRIBUTING.md#local-practice) to try simulated play on your computer.

## Feedback and deployment support

**Deployment services and event preparation support are available** to help you use the game at an annual gathering, exhibition or live event. Participants play by scanning a QR code on their phones, while a big screen shows the shared city and leaderboard. Leave a message to discuss the scope and arrangements.

- [Report a problem](https://github.com/sw897/one-tap-skyline/issues/new?template=bug_report.yml): gameplay, display, access or deployment issues.
- [Suggest a feature](https://github.com/sw897/one-tap-skyline/issues/new?template=feature_request.yml): explain the use case and proposed improvement.
- [Ask about deployment services](https://github.com/sw897/one-tap-skyline/issues/new?template=deployment_support.yml): share your target date, expected participation and the help you need.

If a related [Issue](https://github.com/sw897/one-tap-skyline/issues) exists, continue the conversation there. Posting requires a GitHub account and messages are public. Share a public summary and redacted details first; arrange a private channel later for sensitive deployment information. See the [support guide](SUPPORT.md) for details.

## Frequently asked questions

### Do players need an app or an account?

No. Scan the current event QR code and play in a phone browser. The same browser retains your best tower for the day.

### What happens when there are more than 76 players?

Every valid personal best is retained. The highest-scoring 76 towers get display plots; earlier achievement takes priority for equal scores. Players outside the display can still view their own tower on the phone and compete again with a better score.

### Why does yesterday's QR code stop working?

All game data resets at 00:00 Beijing time and the participation QR code changes. Scan the new code on a new day. The complete page opened from a valid scan remains usable during that day.

## License

This project is licensed under the [MIT License](LICENSE).
