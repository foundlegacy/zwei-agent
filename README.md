# Zulu Agent

Fully native Agentic AI for your Obsidian vault. Chat with your notes, use tools to search, read, and modify files/folders — all powered by AI.

## Features

As of 3.3.0:

- [NEW] Local AI support (LM Studio & Ollama).
- [NEW] Create & edit CSS snippets directly from the chat through natural language.
- [NEW] Improved UI/UX.
- Create/Edit/Search/Read/Rename/Delete .md, .base & .canvas files through the chat interface.
- Create/Rename/Delete folders.
- Vault structure context / native system prompt / current open file context.
- Prompt saving (templates).

## Installation

### BRAT install (recommended)

1. Install the BRAT plug-in from the external plug-ins page of obsidian settings
2. Click 'Add beta plug-in' in the BRAT settings and paste `https://github.com/foundlegacy/zulu-agent` as the plug-in source
3. Enable the plugin in Obsidian Settings → Community Plugins

### Manual Installation

1. Download the latest release from [Releases](https://github.com/foundlegacy/zulu-agent/releases)
2. Extract into your vault's `.obsidian/plugins/zulu-agent/` folder
3. Enable the plugin in Obsidian Settings → Community Plugins

## Configuration

1. Open Settings → Zulu Agent
2. Go to the **Models & Providers** tab
3. Add your API keys for the providers you want to use
4. Configure your chat models
5. Configure system/tool settings

## Development

```bash
# Clone the repository
git clone https://github.com/foundlegacy/zulu-agent.git

# Install dependencies
cd zulu-agent
npm install

# Build
npm run build

# Copy to your vault for testing
cp main.js styles.css manifest.json /path/to/vault/.obsidian/plugins/zulu-agent/

# Or use dev mode with hot reload (requires the Hot Reload community plugin)
npm run dev
```

## Support

If you find Zulu Agent useful, consider supporting development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/foundlegacy)

## License

MIT © [foundlegacy](https://github.com/foundlegacy)
