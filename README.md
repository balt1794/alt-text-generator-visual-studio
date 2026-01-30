# Alt Text Generator

A Visual Studio Code extension that helps you generate alt text for image tags in your code.

## Features

- **Quick Alt Text Generation**: Place your cursor inside an `<img>` or `<Image>` tag and generate alt text
- **Multiple Ways to Trigger**:
  - Right-click context menu
  - Command palette (Ctrl+Shift+P / Cmd+Shift+P → "Generate Alt Text")
  - Editor title bar button
- **Smart Tag Detection**: Automatically detects HTML `<img>` tags and React/Next.js `<Image>` components
- **Placeholder Text**: Currently uses placeholder text (ready for API integration later)

## Usage

1. Open a file with image tags
2. Place your cursor inside an `<img>` or `<Image>` tag
3. Either:
   - Right-click and select "Generate Alt Text"
   - Press Ctrl+Shift+P (Cmd+Shift+P on Mac) and type "Generate Alt Text"
   - Click the button in the editor title bar
4. The extension will add or replace the `alt` attribute with placeholder text

## Example

**Before:**
```html
<img src="photo.jpg">
```

**After:**
```html
<img src="photo.jpg" alt="Descriptive alt text for image">
```

## Development

```bash
npm install
npm run compile
```

Press F5 to run the extension in a new Extension Development Host window.

## Future Enhancements

- API integration for AI-generated alt text
- Custom placeholder text configuration
- Support for more image component variants
