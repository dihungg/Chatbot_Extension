## 🌐 Browser Support

**Officially Supported:**
- **Chrome** - Full support with all features
- **Edge** - Full support with all features

**Not Supported:**
- Firefox, Safari, and other Chromium variants (Opera, Arc, etc.)

> **Note**: While Nanobrowser may function on other Chromium-based browsers, we recommend using Chrome or Edge for the best experience and guaranteed compatibility.


## 🚀 Quick Start

1. **Install from Chrome Web Store** (Stable Version):
   * Visit the [Nanobrowser Chrome Web Store page](https://chromewebstore.google.com/detail/nanobrowser/imbddededgmcgfhfpcjmijokokekbkal)
   * Click "Add to Chrome" button
   * Confirm the installation when prompted

> **Important Note**: For latest features, install from ["Manually Install Latest Version"](#-manually-install-latest-version) below, as Chrome Web Store version may be delayed due to review process.

2. **Configure Agent Models**:
   * Click the Nanobrowser icon in your toolbar to open the sidebar
   * Click the `Settings` icon (top right)
   * Add your LLM API keys
   * Choose which model to use for different agents (Navigator, Planner)

## 🔧 Manually Install Latest Version

To get the most recent version with all the latest features:

1. **Download**
    * Download the latest `nanobrowser.zip` file from the official Github [release page](https://github.com/nanobrowser/nanobrowser/releases).

2. **Install**:
    * Unzip `nanobrowser.zip`.
    * Open `chrome://extensions/` in Chrome
    * Enable `Developer mode` (top right)
    * Click `Load unpacked` (top left)
    * Select the unzipped `nanobrowser` folder.

3. **Configure Agent Models**
    * Click the Nanobrowser icon in your toolbar to open the sidebar
    * Click the `Settings` icon (top right).
    * Add your LLM API keys.
    * Choose which model to use for different agents (Navigator, Planner)

4. **Upgrading**:
    * Download the latest `nanobrowser.zip` file from the release page.
    * Unzip and replace your existing Nanobrowser files with the new ones.
    * Go to `chrome://extensions/` in Chrome and click the refresh icon on the Nanobrowser card.

## 🛠️ Build from Source

If you prefer to build Nanobrowser yourself, follow these steps:

1. **Prerequisites**:
   * [Node.js](https://nodejs.org/) (v22.12.0 or higher)
   * [pnpm](https://pnpm.io/installation) (v9.15.1 or higher)

2. **Clone the Repository**:
   ```bash
   git clone https://github.com/nanobrowser/nanobrowser.git
   cd nanobrowser
   ```

3. **Install Dependencies**:
   ```bash
   pnpm install
   ```

4. **Build the Extension**:
   ```bash
   pnpm build
   ```

5. **Load the Extension**:
   * The built extension will be in the `dist` directory
   * Follow the installation steps from the Manually Install section to load the extension into your browser

6. **Development Mode** (optional):
   ```bash
   pnpm dev
   ```

## 🤖 Choosing Your Models

Nanobrowser allows you to configure different LLM models for each agent to balance performance and cost. Here are recommended configurations:

### Better Performance
- **Planner**: Claude Sonnet 4
  - Better reasoning and planning capabilities
- **Navigator**: Claude Haiku 3.5
  - Efficient for web navigation tasks
  - Good balance of performance and cost

### Cost-Effective Configuration
- **Planner**: Claude Haiku or GPT-4o
  - Reasonable performance at lower cost
  - May require more iterations for complex tasks
- **Navigator**: Gemini 2.5 Flash or GPT-4o-mini
  - Lightweight and cost-efficient
  - Suitable for basic navigation tasks

### Local Models
- **Setup Options**:
  - Use Ollama or other custom OpenAI-compatible providers to run models locally
  - Zero API costs and complete privacy with no data leaving your machine

- **Recommended Models**:
  - **Qwen3-30B-A3B-Instruct-2507**
  - **Falcon3 10B**
  - **Qwen 2.5 Coder 14B**
  - **Mistral Small 24B**
  - [Latest test results from community](https://gist.github.com/maximus2600/75d60bf3df62986e2254d5166e2524cb) 
  - We welcome community experience sharing with other local models in our [Discord](https://discord.gg/NN3ABHggMK)

- **Prompt Engineering**:
  - Local models require more specific and cleaner prompts
  - Avoid high-level, ambiguous commands
  - Break complex tasks into clear, detailed steps
  - Provide explicit context and constraints

> **Note**: The cost-effective configuration may produce less stable outputs and require more iterations for complex tasks.

> **Tip**: Feel free to experiment with your own model configurations! Found a great combination? Share it with the community in our [Discord](https://discord.gg/NN3ABHggMK) to help others optimize their setup.


