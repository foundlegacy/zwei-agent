# Zwei Agent

Fully native Agentic AI for your Obsidian vault. Chat with your notes, use tools to search, read, and modify files/folders — all powered by AI.

## Features

- Tool system: read/edit/search/create/delete files and folders, works with .md, .base and .canvas files
- User confirmation on sensitive tools such as edit/deletion tools, to ensure security
- AI chat interface inside Obsidian
- Support for multiple LLM providers (OpenAI, DeepSeek, Anthropic, Gemini, Kimi, etc.)
- Customizable system prompting and saved prompt templates
- Token usage tracking and pricing information

## Installation

### BRAT install (recommended)

1. install the BRAT plug-in from the external plug-ins page of obsidian settings
2. Click 'add beta plug-in' in the BRAT settings and paste 'https://github.com/FoundLegacy/zwei-agent-obsidian' as the plug-in source.
3. Enable the plugin in Obsidian Settings → Community Plugins

### Manual Installation

1. Download the latest release from [Releases](https://github.com/FoundLegacy/zwei-agent-obsidian/releases)
2. Paste into your vault's `.obsidian/plugins/zwei-agent-obsidian/` folder
3. Enable the plugin in Obsidian Settings → Community Plugins

## Configuration

1. Open Settings → Zwei Agent
2. Go to the **Models & Providers** tab
3. Add your API keys for the providers you want to use
4. Configure your chat models
5. Configure system settings

## Development

```bash
# Install dependencies
npm install

# Start dev mode with hot reload
npm run dev

# Production build
npm run build
```

## Support

If you find Zwei Agent useful, consider supporting development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/foundlegacy)

## License

MIT © [FoundLegacy](https://github.com/FoundLegacy)
