# How to Install and Use the Extension

## For Development (Testing)
When you're developing/testing the extension:
- Press **F5** to run in Extension Development Host
- This opens a new window where you can test the extension
- You need to do this every time you want to test changes

## For Regular Use (Installing the Extension)

Once the extension is ready, you can package and install it so it works all the time without debugging:

### Step 1: Install the packaging tool
```bash
npm install
```
(This will install @vscode/vsce which is needed for packaging)

### Step 2: Package the extension
```bash
npm run package
```
This creates a `.vsix` file (e.g., `alt-text-generator-0.0.1.vsix`)

### Step 3: Install the extension
**Option A: Install from VSIX file**
1. Open VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
3. Type: `Extensions: Install from VSIX...`
4. Select the `.vsix` file that was created
5. The extension is now installed!

**Option B: Install from command line**
```bash
code --install-extension alt-text-generator-0.0.1.vsix
```

### Step 4: Use the extension
Once installed, the extension will work in any VS Code window:
1. Open any file with image tags
2. Place cursor on a line with `<img>` tag
3. Right-click → "Generate Alt Text"
   OR
   Press `Cmd+Shift+P` → "Generate Alt Text"

## Updating the Extension
If you make changes and want to update:
1. Update the version in `package.json`
2. Run `npm run package` again
3. Install the new `.vsix` file (it will replace the old one)

## Publishing to VS Code Marketplace (Optional)
If you want to share it publicly:
1. Create a publisher account at https://marketplace.visualstudio.com
2. Get a Personal Access Token
3. Run: `vsce publish`