[Home](README.md) | [Quick Start](docs/quick-start.md) | [Overview](docs/overview.md) | [Features](docs/features.md) | [Installation](docs/installation/index.md) | [Settings](docs/settings/index.md) | [Troubleshooting](docs/troubleshooting.md) | [FAQ](docs/faq.md)

---
# Contributing to the Nuvio Wiki

Thank you for wanting to improve this community resource! Since this is an unofficial project, your help is vital!

## How to Help
- **Report Inaccuracies:** If a setup step is outdated, open an issue.
- **Add Guides:** If you use Nuvio on a platform not covered (like Firestick or specific Android boxes), feel free to submit a guide.
- **Clarify FAQ:** Help us answer common community questions.
- **Translate the Wiki:** Follow the [Translation Guide](TRANSLATING.md) to add or maintain a language without changing the English docs.

## Style Guide
- Use clear, step-by-step instructions.
- Use Markdown formatting for tables and code blocks.
- Mark platform-specific content with `[Android TV Only]`, `[TV Only]`, `[Android Mobile Only]`, `[Mobile Only]`, `[iOS Only]`, `[WebOS Only]`, or `[Tizen Only]`. The existing `[TV Optimized]` and `[Required for Mobile]` qualifiers are also supported. These exact labels automatically render as badges and are not case-sensitive.
- Keep the **Disclaimer** visible in major entry points.

## Adding or Renaming Pages
- Add or update the canonical path in `docs/.vitepress/routes.mts`, then reuse that route in navigation or theme components.
- When renaming or moving a published page, add its old path to `legacyRouteRedirects` in that same file so existing bookmarks keep working.
- Run `npm run docs:build`. The build validates registered documents, Markdown links, navigation, cards, and other rendered internal links before deployment.

## Disclaimer
Reminder: This project is **not** official. Do not contact Nuvio developers regarding issues with this wiki.
