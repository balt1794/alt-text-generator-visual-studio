import * as vscode from 'vscode';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import { URL } from 'url';

// Dynamic import for Sharp to handle cases where it might not be available
let sharpModule: any = null;
async function getSharp(): Promise<any> {
    if (!sharpModule) {
        try {
            // Use require for Sharp since it's a native module
            sharpModule = require('sharp');
        } catch (error) {
            console.warn('Sharp not available:', error);
            return null;
        }
    }
    return sharpModule;
}

const API_ENDPOINT = 'https://alttextgeneratorai.com/api/vs';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];

export function activate(context: vscode.ExtensionContext) {
    console.log('Alt Text Generator extension activated!');
    
    // Command to set/update API key
    let setApiKeyDisposable = vscode.commands.registerCommand('altTextGenerator.setApiKey', async () => {
        const config = vscode.workspace.getConfiguration('altTextGenerator');
        const currentApiKey = config.get<string>('apiKey', '');
        
        let promptText = 'Enter your API key for alttextgeneratorai.com';
        if (currentApiKey && currentApiKey.trim() !== '') {
            promptText = 'Enter your API key (leave empty to keep current key)';
        }
        
        const apiKey = await vscode.window.showInputBox({
            prompt: promptText,
            placeHolder: currentApiKey ? '••••••••' : 'Your API key',
            password: true,
            ignoreFocusOut: true,
            value: '' // Don't show current value for security
        });
        
        if (apiKey !== undefined) { // User pressed Enter (even if empty)
            if (apiKey && apiKey.trim() !== '') {
                // Save new API key
                await config.update('apiKey', apiKey.trim(), vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('✅ API key saved successfully!');
            } else if (currentApiKey && currentApiKey.trim() !== '') {
                // User left it empty but we have a current key, so keep it
                vscode.window.showInformationMessage('API key unchanged.');
            } else {
                // User left it empty and no current key
                vscode.window.showWarningMessage('No API key entered. Please set your API key to use this extension.');
            }
        }
    });
    
    // Command to view API key status
    let viewApiKeyDisposable = vscode.commands.registerCommand('altTextGenerator.viewApiKey', async () => {
        const config = vscode.workspace.getConfiguration('altTextGenerator');
        const apiKey = config.get<string>('apiKey', '');
        const language = config.get<string>('language', 'english');
        
        if (apiKey && apiKey.trim() !== '') {
            const maskedKey = apiKey.length > 8 
                ? `${apiKey.substring(0, 4)}••••${apiKey.substring(apiKey.length - 4)}`
                : '••••••••';
            const action = await vscode.window.showInformationMessage(
                `API Key: ${maskedKey}\nLanguage: ${language}`,
                'Change API Key',
                'Change Language',
                'OK'
            );
            
            if (action === 'Change API Key') {
                await vscode.commands.executeCommand('altTextGenerator.setApiKey');
            } else if (action === 'Change Language') {
                const newLanguage = await vscode.window.showInputBox({
                    prompt: 'Enter language (e.g., english, spanish, french)',
                    placeHolder: language,
                    value: language,
                    ignoreFocusOut: true
                });
                if (newLanguage) {
                    await config.update('language', newLanguage.trim(), vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(`Language set to: ${newLanguage.trim()}`);
                }
            }
        } else {
            const action = await vscode.window.showWarningMessage(
                'No API key configured. Please set your API key to use this extension.',
                'Set API Key',
                'Cancel'
            );
            if (action === 'Set API Key') {
                await vscode.commands.executeCommand('altTextGenerator.setApiKey');
            }
        }
    });
    
    // Main command - handles command palette, editor selection, and image tags
    let disposable = vscode.commands.registerCommand('altTextGenerator.generateAltText', async () => {
        console.log('Generate Alt Text command triggered');
        const editor = vscode.window.activeTextEditor;
        
        // Check if there's selected text in the editor
        if (editor && !editor.selection.isEmpty) {
            const selectedText = editor.document.getText(editor.selection).trim();
            console.log(`Selected text: ${selectedText}`);
            
            // Check if selected text is an image URL
            if (isImageUrl(selectedText)) {
                await handleSelectedImageUrl(editor, selectedText);
                return;
            }
            
            // Check if selected text is an HTML/React image tag
            const imgTagMatch = selectedText.match(/^<(img|Image)\s+[^>]*>?$/i);
            if (imgTagMatch) {
                await handleSelectedImageTag(editor, selectedText);
                return;
            }
        }
        
        // If editor exists, try to find image tag at cursor position
        if (editor) {
            const document = editor.document;
            const selection = editor.selection;
            
            // Get the line where the cursor is
            const line = document.lineAt(selection.active.line);
            const lineText = line.text;
            console.log(`Current line: ${lineText}`);
            console.log(`Cursor position: ${selection.active.character}`);
            
            // Pattern to match image tags: <img ...> or <Image ...> or similar
            const imgTagRegex = /<img\s+[^>]*>/gi;
            const reactImgRegex = /<Image\s+[^>]*\/?>/gi;
            
            let match;
            let foundTag = false;
            let closestTag: { match: RegExpExecArray; isReact: boolean } | null = null;
            let closestDistance = Infinity;
            
            // Check for standard HTML img tags on the current line
            imgTagRegex.lastIndex = 0;
            while ((match = imgTagRegex.exec(lineText)) !== null) {
                const fullTag = match[0];
                const attributesMatch = fullTag.match(/<img\s+(.*?)>/i);
                const attributes = attributesMatch ? attributesMatch[1] : '';
                const tagStart = match.index;
                const tagEnd = tagStart + fullTag.length;
                
                if (selection.active.character >= tagStart && selection.active.character <= tagEnd) {
                    foundTag = true;
                    await processImageTag(editor, line, tagStart, tagEnd, fullTag, attributes, false);
                    return;
                }
                
                const distance = Math.min(
                    Math.abs(selection.active.character - tagStart),
                    Math.abs(selection.active.character - tagEnd)
                );
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestTag = { match, isReact: false };
                }
            }
            
            // Check for React/Next.js Image components
            reactImgRegex.lastIndex = 0;
            while ((match = reactImgRegex.exec(lineText)) !== null) {
                const fullTag = match[0];
                const attributesMatch = fullTag.match(/<Image\s+(.*?)(\/?>)/i);
                const attributes = attributesMatch ? attributesMatch[1] : '';
                const tagStart = match.index;
                const tagEnd = tagStart + fullTag.length;
                
                if (selection.active.character >= tagStart && selection.active.character <= tagEnd) {
                    foundTag = true;
                    await processImageTag(editor, line, tagStart, tagEnd, fullTag, attributes, true);
                    return;
                }
                
                const distance = Math.min(
                    Math.abs(selection.active.character - tagStart),
                    Math.abs(selection.active.character - tagEnd)
                );
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestTag = { match, isReact: true };
                }
            }
            
            // If no tag found at cursor, try the closest one on the line
            if (!foundTag && closestTag && closestDistance < 50) {
                const match = closestTag.match;
                const fullTag = match[0];
                const attributesMatch = closestTag.isReact 
                    ? fullTag.match(/<Image\s+(.*?)(\/?>)/i)
                    : fullTag.match(/<img\s+(.*?)>/i);
                const attributes = attributesMatch ? attributesMatch[1] : '';
                const tagStart = match.index;
                const tagEnd = tagStart + fullTag.length;
                await processImageTag(editor, line, tagStart, tagEnd, fullTag, attributes, closestTag.isReact);
                return;
            }
        }
        
        // If no editor or no tag found, prompt for image URL (command palette usage)
        const imageUrl = await vscode.window.showInputBox({
            prompt: 'Enter the image URL or local file path',
            placeHolder: 'https://example.com/image.jpg or ./images/photo.png',
            ignoreFocusOut: true
        });
        
        if (imageUrl && imageUrl.trim()) {
            // Process the image URL (convert local files to base64 if needed)
            const processedImageUrl = await processImageUrl(imageUrl.trim(), undefined);
            const altText = await generateAltTextFromUrl(processedImageUrl);
            if (altText) {
                // Copy to clipboard
                await vscode.env.clipboard.writeText(altText);
                vscode.window.showInformationMessage(`Alt text generated and copied to clipboard: "${altText}"`);
            }
        }
    });
    
    // Command for file explorer - right-click on image file
    let fileDisposable = vscode.commands.registerCommand('altTextGenerator.generateAltTextFromFile', async (fileUri: vscode.Uri) => {
        if (!fileUri) {
            vscode.window.showErrorMessage('No file selected');
            return;
        }
        
        const filePath = fileUri.fsPath;
        const fileExt = path.extname(filePath).toLowerCase();
        
        if (!IMAGE_EXTENSIONS.includes(fileExt)) {
            vscode.window.showErrorMessage('Selected file is not an image');
            return;
        }
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            vscode.window.showErrorMessage('File does not exist');
            return;
        }
        
        // Convert local file to base64
        const base64Image = await convertFileToBase64(filePath);
        if (!base64Image) {
            vscode.window.showErrorMessage('Failed to read image file');
            return;
        }
        
        const altText = await generateAltTextFromUrl(base64Image);
        if (altText) {
            // Copy to clipboard
            await vscode.env.clipboard.writeText(altText);
            vscode.window.showInformationMessage(`Alt text generated and copied to clipboard: "${altText}"`);
        }
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(setApiKeyDisposable);
    context.subscriptions.push(viewApiKeyDisposable);
    context.subscriptions.push(fileDisposable);
}

// Helper function to check if a string is an image URL
function isImageUrl(text: string): boolean {
    try {
        const url = new URL(text);
        const pathname = url.pathname.toLowerCase();
        return IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext));
    } catch {
        // If it's not a valid URL, check if it looks like a relative path to an image
        const lowerText = text.toLowerCase();
        return IMAGE_EXTENSIONS.some(ext => lowerText.endsWith(ext));
    }
}

// Handle selected image URL in editor
async function handleSelectedImageUrl(editor: vscode.TextEditor, imageUrl: string) {
    // Check if it's a local file path and convert to base64 if needed
    const processedImageUrl = await processImageUrl(imageUrl, editor.document.uri);
    
    const altText = await generateAltTextFromUrl(processedImageUrl);
    if (!altText) {
        return;
    }
    
    // Check if the selection is part of an image tag
    const line = editor.document.lineAt(editor.selection.active.line);
    const lineText = line.text;
    
    // Try to find if this URL is part of an img tag
    const imgTagRegex = /<(img|Image)\s+[^>]*>/gi;
    let match;
    imgTagRegex.lastIndex = 0;
    
    while ((match = imgTagRegex.exec(lineText)) !== null) {
        const fullTag = match[0];
        const tagStart = match.index;
        const tagEnd = tagStart + fullTag.length;
        
        // Check if selection overlaps with this tag
        if (editor.selection.start.character >= tagStart && editor.selection.end.character <= tagEnd) {
            // This is part of an image tag, append alt attribute
            const attributesMatch = fullTag.match(/<(img|Image)\s+(.*?)(\/?>)/i);
            const attributes = attributesMatch ? attributesMatch[2] : '';
            const isReact = fullTag.toLowerCase().startsWith('<image');
            
            await processImageTag(editor, line, tagStart, tagEnd, fullTag, attributes, isReact);
            return;
        }
    }
    
    // If not part of a tag, just copy to clipboard
    await vscode.env.clipboard.writeText(altText);
    vscode.window.showInformationMessage(`Alt text generated and copied to clipboard: "${altText}"`);
}

// Handle selected image tag in editor
async function handleSelectedImageTag(editor: vscode.TextEditor, selectedText: string) {
    const isReact = selectedText.toLowerCase().startsWith('<image');
    const attributesMatch = selectedText.match(/<(img|Image)\s+(.*?)(\/?>)/i);
    const attributes = attributesMatch ? attributesMatch[2] : '';
    
    // Extract image URL from src attribute
    const srcRegex = /src\s*=\s*["']([^"']*)["']/i;
    const srcMatch = attributes.match(srcRegex);
    
    if (!srcMatch || !srcMatch[1]) {
        vscode.window.showErrorMessage('No image URL found in src attribute');
        return;
    }
    
    const imageUrl = srcMatch[1];
    // Process the image URL (convert local files to base64)
    const processedImageUrl = await processImageUrl(imageUrl, editor.document.uri);
    const altText = await generateAltTextFromUrl(processedImageUrl);
    
    if (!altText) {
        return;
    }
    
    // Replace the selected tag with one that includes alt text
    const altRegex = /alt\s*=\s*["']([^"']*)["']/i;
    let newTag: string;
    
    if (attributes.match(altRegex)) {
        // Replace existing alt
        const newAttributes = attributes.replace(altRegex, `alt="${altText}"`);
        newTag = isReact ? `<Image ${newAttributes} />` : `<img ${newAttributes}>`;
    } else {
        // Add alt attribute after src
        if (srcMatch.index !== undefined) {
            const insertPosition = srcMatch.index + srcMatch[0].length;
            const newAttributes = 
                attributes.slice(0, insertPosition) + 
                ` alt="${altText}"` + 
                attributes.slice(insertPosition);
            newTag = isReact ? `<Image ${newAttributes} />` : `<img ${newAttributes}>`;
        } else {
            const trimmedAttributes = attributes.trim();
            const newAttributes = trimmedAttributes
                ? `${trimmedAttributes} alt="${altText}"`
                : `alt="${altText}"`;
            newTag = isReact ? `<Image ${newAttributes} />` : `<img ${newAttributes}>`;
        }
    }
    
    await editor.edit(editBuilder => {
        editBuilder.replace(editor.selection, newTag);
    });
    
    vscode.window.showInformationMessage('Alt text generated successfully!');
}

// Generate alt text from URL (shared function)
async function generateAltTextFromUrl(imageUrl: string): Promise<string | null> {
    // Get API key and language from settings
    const config = vscode.workspace.getConfiguration('altTextGenerator');
    let apiKey = config.get<string>('apiKey', '');
    const language = config.get<string>('language', 'english');
    
    // If API key is not set, prompt user
    if (!apiKey || apiKey.trim() === '') {
        const action = await vscode.window.showWarningMessage(
            'API key not configured. Please set your API key to use this feature.',
            'Set API Key Now',
            'View Settings',
            'Cancel'
        );
        
        if (action === 'Set API Key Now') {
            await vscode.commands.executeCommand('altTextGenerator.setApiKey');
            // Refresh config after setting
            apiKey = vscode.workspace.getConfiguration('altTextGenerator').get<string>('apiKey', '');
            if (!apiKey || apiKey.trim() === '') {
                return null;
            }
        } else if (action === 'View Settings') {
            await vscode.commands.executeCommand('altTextGenerator.viewApiKey');
            return null;
        } else {
            return null;
        }
    }
    
    // Show progress
    const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: "Generating alt text...",
        cancellable: false
    };
    
    let generatedAltText: string = '';
    
    try {
        await vscode.window.withProgress(progressOptions, async (progress) => {
            progress.report({ increment: 0, message: "Calling API..." });
            
            generatedAltText = await makeApiCall(imageUrl, apiKey, language);
            
            progress.report({ increment: 50, message: "Processing response..." });
            
            // Clean up the response
            generatedAltText = generatedAltText.trim();
            generatedAltText = generatedAltText.replace(/^["']|["']$/g, '');
            generatedAltText = generatedAltText.replace(/^alt\s*text\s*:?\s*/i, '');
            
            progress.report({ increment: 100, message: "Complete!" });
        });
    } catch (error: any) {
        console.error('Error generating alt text:', error);
        const errorMessage = error.message || 'Failed to generate alt text';
        
        if (errorMessage.includes('401') || errorMessage.includes('Verify API key')) {
            vscode.window.showErrorMessage('Invalid API key or no credits remaining. Please check your API key.');
        } else if (errorMessage.includes('500')) {
            vscode.window.showErrorMessage('Server error. Please try again later.');
        } else {
            vscode.window.showErrorMessage(`Error: ${errorMessage}`);
        }
        return null;
    }
    
    if (!generatedAltText || generatedAltText.trim() === '') {
        vscode.window.showErrorMessage('Received empty response from API.');
        return null;
    }
    
    return generatedAltText;
}

async function processImageTag(
    editor: vscode.TextEditor,
    line: vscode.TextLine,
    tagStart: number,
    tagEnd: number,
    fullTag: string,
    attributes: string,
    isReactComponent: boolean
) {
    // Extract image URL from src attribute
    const srcRegex = /src\s*=\s*["']([^"']*)["']/i;
    const srcMatch = attributes.match(srcRegex);
    
    if (!srcMatch || !srcMatch[1]) {
        vscode.window.showErrorMessage('No image URL found in src attribute. Please add a src attribute to your image tag.');
        return;
    }
    
    const imageUrl = srcMatch[1];
    console.log(`Image URL: ${imageUrl}`);
    
    // Process the image URL (convert local files to base64)
    const processedImageUrl = await processImageUrl(imageUrl, editor.document.uri);
    
    // Use shared function to generate alt text
    const generatedAltText = await generateAltTextFromUrl(processedImageUrl);
    
    if (!generatedAltText) {
        return; // Error already shown in generateAltTextFromUrl
    }
    
    // Check if alt attribute already exists
    const altRegex = /alt\s*=\s*["']([^"']*)["']/i;
    const altMatch = attributes.match(altRegex);
    
    let newTag: string;
    
    if (altMatch) {
        // Replace existing alt text
        const newAttributes = attributes.replace(altRegex, `alt="${generatedAltText}"`);
        newTag = isReactComponent 
            ? `<Image ${newAttributes} />`
            : `<img ${newAttributes}>`;
    } else {
        // Add alt attribute
        // Try to find src attribute to place alt near it
        if (srcMatch && srcMatch.index !== undefined) {
            // Insert alt after src
            const insertPosition = srcMatch.index + srcMatch[0].length;
            const newAttributes = 
                attributes.slice(0, insertPosition) + 
                ` alt="${generatedAltText}"` + 
                attributes.slice(insertPosition);
            newTag = isReactComponent 
                ? `<Image ${newAttributes} />`
                : `<img ${newAttributes}>`;
        } else {
            // Just append alt attribute
            const trimmedAttributes = attributes.trim();
            const newAttributes = trimmedAttributes
                ? `${trimmedAttributes} alt="${generatedAltText}"`
                : `alt="${generatedAltText}"`;
            newTag = isReactComponent 
                ? `<Image ${newAttributes} />`
                : `<img ${newAttributes}>`;
        }
    }
    
    // Replace the tag in the editor
    const range = new vscode.Range(
        line.lineNumber,
        tagStart,
        line.lineNumber,
        tagEnd
    );
    
    const success = await editor.edit(editBuilder => {
        editBuilder.replace(range, newTag);
    });
    
    if (success) {
        vscode.window.showInformationMessage('Alt text generated successfully!');
    } else {
        vscode.window.showErrorMessage('Failed to update the image tag.');
    }
}

function makeApiCall(imageUrl: string, apiKey: string, language: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = new URL(API_ENDPOINT);
        const postData = JSON.stringify({
            image: imageUrl,
            wpkey: apiKey,
            language: language
        });

        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(data || `API returned status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

// Convert local file to base64 data URL with optional resizing
async function convertFileToBase64(filePath: string): Promise<string | null> {
    try {
        const fileExt = path.extname(filePath).toLowerCase();
        
        // Determine MIME type based on extension
        const mimeTypes: { [key: string]: string } = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.bmp': 'image/bmp',
            '.ico': 'image/x-icon'
        };
        
        const mimeType = mimeTypes[fileExt] || 'image/png';
        
        // Check file size first
        const stats = fs.statSync(filePath);
        const fileSizeKB = stats.size / 1024;
        
        // Get configuration
        const config = vscode.workspace.getConfiguration('altTextGenerator');
        const maxFileSizeKB = config.get<number>('maxFileSizeKB', 300);
        const maxWidth = config.get<number>('maxImageWidth', 800);
        const maxHeight = config.get<number>('maxImageHeight', 800);
        const jpegQuality = config.get<number>('jpegQuality', 75);
        
        // SVG files can't be resized with Sharp, check size and warn if too large
        if (fileExt === '.svg') {
            if (fileSizeKB > maxFileSizeKB) {
                vscode.window.showWarningMessage(
                    `SVG file is ${fileSizeKB.toFixed(0)}KB (max: ${maxFileSizeKB}KB). ` +
                    `SVG files cannot be resized. Please use a smaller SVG or convert to a raster format.`
                );
                return null;
            }
            const fileBuffer = fs.readFileSync(filePath);
            const base64String = fileBuffer.toString('base64');
            return `data:${mimeType};base64,${base64String}`;
        }
        
        const sharp = await getSharp();
        
        if (!sharp) {
            // Sharp not available
            if (fileSizeKB > maxFileSizeKB) {
                vscode.window.showWarningMessage(
                    `Image file is ${fileSizeKB.toFixed(0)}KB (max: ${maxFileSizeKB}KB). ` +
                    `Sharp library not available for resizing. Please run 'npm install' to install Sharp.`
                );
                return null;
            }
            // Small file, read directly
            const fileBuffer = fs.readFileSync(filePath);
            const base64String = fileBuffer.toString('base64');
            return `data:${mimeType};base64,${base64String}`;
        }
        
        // Sharp is available - always resize if file is too large OR dimensions exceed limits
        try {
            const sharpInstance = sharp(filePath);
            const metadata = await sharpInstance.metadata();
            
            const needsResize = fileSizeKB > maxFileSizeKB || 
                (metadata.width && metadata.width > maxWidth) || 
                (metadata.height && metadata.height > maxHeight);
            
            if (needsResize) {
                console.log(`Resizing image: ${metadata.width}x${metadata.height}, ${fileSizeKB.toFixed(0)}KB -> max ${maxWidth}x${maxHeight}`);
                
                // Resize image maintaining aspect ratio and convert to JPEG
                let resizedBuffer = await sharpInstance
                    .resize(maxWidth, maxHeight, {
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .jpeg({ quality: jpegQuality, mozjpeg: true })
                    .toBuffer();
                
                // Check if resized buffer is still too large (base64 is ~33% larger)
                const resizedSizeKB = resizedBuffer.length / 1024;
                const base64SizeKB = (resizedBuffer.length * 1.33) / 1024;
                
                // If still too large, reduce quality further
                if (base64SizeKB > maxFileSizeKB && jpegQuality > 50) {
                    console.log(`Resized image still large (${base64SizeKB.toFixed(0)}KB), reducing quality further`);
                    resizedBuffer = await sharpInstance
                        .resize(maxWidth, maxHeight, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: 50, mozjpeg: true })
                        .toBuffer();
                }
                
                const base64String = resizedBuffer.toString('base64');
                const finalSizeKB = (base64String.length / 1024);
                console.log(`Final base64 size: ${finalSizeKB.toFixed(0)}KB`);
                
                return `data:image/jpeg;base64,${base64String}`;
            } else {
                // File is within limits, read directly
                const fileBuffer = fs.readFileSync(filePath);
                const base64String = fileBuffer.toString('base64');
                const finalSizeKB = (base64String.length / 1024);
                
                // Double-check base64 size (base64 is ~33% larger than original)
                if (finalSizeKB > maxFileSizeKB * 1.5) {
                    // Even though file size was OK, base64 is too large - resize anyway
                    console.log(`Base64 size (${finalSizeKB.toFixed(0)}KB) exceeds limit, resizing anyway`);
                    const resizedBuffer = await sharpInstance
                        .resize(maxWidth, maxHeight, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: jpegQuality, mozjpeg: true })
                        .toBuffer();
                    return `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
                }
                
                return `data:${mimeType};base64,${base64String}`;
            }
        } catch (sharpError) {
            // If Sharp fails, try original file if small enough
            console.warn('Sharp resize failed:', sharpError);
            if (fileSizeKB > maxFileSizeKB) {
                vscode.window.showErrorMessage('Failed to resize image and file is too large. Please use a smaller image.');
                return null;
            }
            const fileBuffer = fs.readFileSync(filePath);
            const base64String = fileBuffer.toString('base64');
            return `data:${mimeType};base64,${base64String}`;
        }
    } catch (error) {
        console.error('Error converting file to base64:', error);
        return null;
    }
}

// Process image URL - convert local files to base64, keep URLs as-is
async function processImageUrl(imageUrl: string, documentUri: vscode.Uri | undefined): Promise<string> {
    // If it's already a base64 data URL, return as-is
    if (imageUrl.startsWith('data:image/')) {
        return imageUrl;
    }
    
    // If it's a full URL (http/https), return as-is
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
    }
    
    // If it's a file:// URL, convert to base64
    if (imageUrl.startsWith('file://')) {
        try {
            const fileUri = vscode.Uri.parse(imageUrl);
            const base64 = await convertFileToBase64(fileUri.fsPath);
            return base64 || imageUrl; // Fallback to original if conversion fails
        } catch {
            return imageUrl;
        }
    }
    
    // If it's a relative path, try to resolve it relative to the document
    if (documentUri) {
        try {
            // Resolve relative path
            const documentDir = path.dirname(documentUri.fsPath);
            const resolvedPath = path.resolve(documentDir, imageUrl);
            
            // Check if file exists
            if (fs.existsSync(resolvedPath)) {
                const base64 = await convertFileToBase64(resolvedPath);
                if (base64) {
                    return base64;
                }
            }
        } catch (error) {
            console.error('Error resolving relative path:', error);
        }
    }
    
    // If it looks like a local file path (starts with / or ./ or ../)
    if (imageUrl.startsWith('/') || imageUrl.startsWith('./') || imageUrl.startsWith('../')) {
        try {
            // Try to resolve as absolute path first
            let filePath = imageUrl;
            if (!path.isAbsolute(imageUrl) && documentUri) {
                const documentDir = path.dirname(documentUri.fsPath);
                filePath = path.resolve(documentDir, imageUrl);
            }
            
            if (fs.existsSync(filePath)) {
                const base64 = await convertFileToBase64(filePath);
                if (base64) {
                    return base64;
                }
            }
        } catch (error) {
            console.error('Error processing local file path:', error);
        }
    }
    
    // If we can't determine it's a local file, return as-is (might be a URL without protocol)
    return imageUrl;
}

export function deactivate() {}
