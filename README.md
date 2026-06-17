# Nuvio Wiki

A modern, searchable documentation site for Nuvio. The site is community-maintained and is not affiliated with the official Nuvio development team. The website is live on: https://nuvio.wiki/

## Local development

On Windows, double-click `Start Nuvio Wiki.cmd` to start the server and open the site in your browser.

Or run it manually:

```bash
npm install
npm run docs:dev
```

VitePress serves the site locally and updates as Markdown files change.

## Production build

```bash
npm run docs:build
npm run docs:preview
```

The static output is written to `docs/.vitepress/dist`.

## Documentation

- [Quick Start](docs/quick-start.md)
- [Overview](docs/overview.md)
- [Features](docs/features.md)
- [Installation](docs/installation/index.md)
- [Settings](docs/settings/index.md)
- [Integrations](docs/integrations/index.md)
- [Troubleshooting](docs/troubleshooting.md)
- [FAQ](docs/faq.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for writing and contribution guidance.
