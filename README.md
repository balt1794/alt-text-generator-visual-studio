# Alt Text Generator AI

This extension generates alt text for images using AI. Perfect for improving accessibility and SEO in your web projects.

## Features

- 🤖 **AI-Powered**: Uses advanced AI to generate descriptive, SEO-optimized alt text
- 🖼️ **Multiple Input Methods**:
  - Command palette - Enter image URL directly
  - Editor selection - Select image URL or tag in code
  - File explorer - Right-click on image files
- 🔧 **Smart Processing**:
  - Automatically detects HTML `<img>` tags and React/Next.js `<Image>` components
  - Supports local files, relative paths, and URLs
  - Automatically resizes large images to prevent payload errors
- 🌍 **Multi-language Support**: Generate alt text in multiple languages

## Usage

### Method 1: Command Palette
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
2. Type "Generate Alt-Text"
3. Enter the image URL when prompted
4. Alt text is generated and copied to clipboard

### Method 2: Editor Selection
1. Select an image URL or image tag in your code
2. Press `Cmd+Shift+P` → "Generate Alt-Text"
3. If it's an image tag, the `alt` attribute is automatically added/updated
4. If it's just a URL, alt text is copied to clipboard

### Method 3: File Explorer
1. Right-click on an image file in VS Code's file explorer
2. Select "Generate Alt Text"
3. Alt text is generated and copied to clipboard

## Setup

1. **Install the extension** from VS Code Marketplace
2. **Set your API key**:
   - Press `Cmd+Shift+P` → "Alt Text Generator: Set API Key"
   - Or go to Settings → Search "Alt Text Generator" → Enter API key
3. **Get your API key** from [alttextgeneratorai.com](https://alttextgeneratorai.com)


## Example

**Before:**
```html
<img src="photo.jpg">
```

**After:**
```html
<img src="photo.jpg" alt="A beautiful sunset over the ocean with orange and pink hues">
```

## Requirements

- VS Code 1.74.0 or higher
- API key
- Node.js (for Sharp library - automatically bundled)

## Development

```bash
npm install
npm run compile
```

Press F5 to run the extension in a new Extension Development Host window.

## License

MIT
