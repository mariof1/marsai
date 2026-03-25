# MarsAI CLI

🚀 Interactive AI chatbot for your terminal, powered by [OpenRouter](https://openrouter.ai/).

## Install

One-liner install on any Linux machine (installs Node.js automatically if needed):

```bash
curl -fsSL https://raw.githubusercontent.com/mariof1/marsai/main/install.sh | bash
```

Or install manually from source:

```bash
git clone https://github.com/mariof1/marsai.git
cd marsai
npm install -g .
```

## Setup

Set your OpenRouter API key using one of these methods:

```bash
# Option 1: Environment variable (recommended for servers)
export OPENROUTER_API_KEY=sk-or-v1-...

# Option 2: Save to config file
marsai --set-key sk-or-v1-...
```

The key is stored in `~/.marsai/config.json` (mode 600). Environment variable takes priority over the config file.

## Usage

```bash
marsai                          # Start interactive chat
marsai --model google/gemini-2.0-flash-exp:free   # Use a specific model
marsai --set-key sk-or-v1-...   # Save API key
marsai --help                   # Show help
marsai --version                # Show version
```

### In-Chat Commands

| Command    | Description                |
|------------|----------------------------|
| `/help`    | Show available commands    |
| `/clear`   | Clear conversation history |
| `/model`   | Show or change model       |
| `/history` | Show conversation history  |
| `/exit`    | Exit MarsAI                |

## Configuration

Environment variables:
- `OPENROUTER_API_KEY` — Your OpenRouter API key
- `MARSAI_MODEL` — Override the default model

Config file (`~/.marsai/config.json`):
```json
{
  "apiKey": "sk-or-v1-...",
  "model": "anthropic/claude-sonnet-4-20250514",
  "systemPrompt": "You are MarsAI, a helpful CLI assistant."
}
```

## License

MIT
