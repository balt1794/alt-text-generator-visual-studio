import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Alt Text Generator extension activated!');
    
    let disposable = vscode.commands.registerCommand('altTextGenerator.generateAltText', () => {
        console.log('Generate Alt Text command triggered');
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        
        // Get the line where the cursor is
        const line = document.lineAt(selection.active.line);
        const lineText = line.text;
        console.log(`Current line: ${lineText}`);
        console.log(`Cursor position: ${selection.active.character}`);
        
        // Pattern to match image tags: <img ...> or <Image ...> or similar
        // More flexible regex that handles img tags with or without spaces
        const imgTagRegex = /<img\s+[^>]*>/gi;
        const reactImgRegex = /<Image\s+[^>]*\/?>/gi;
        
        let match;
        let foundTag = false;
        let closestTag: { match: RegExpExecArray; isReact: boolean } | null = null;
        let closestDistance = Infinity;
        
        // Check for standard HTML img tags on the current line
        // Reset regex lastIndex to avoid issues
        imgTagRegex.lastIndex = 0;
        while ((match = imgTagRegex.exec(lineText)) !== null) {
            const fullTag = match[0];
            // Extract attributes (everything between <img and >)
            const attributesMatch = fullTag.match(/<img\s+(.*?)>/i);
            const attributes = attributesMatch ? attributesMatch[1] : '';
            const tagStart = match.index;
            const tagEnd = tagStart + fullTag.length;
            console.log(`Found img tag: ${fullTag} at position ${tagStart}-${tagEnd}`);
            
            // Check if cursor is within this tag
            if (selection.active.character >= tagStart && selection.active.character <= tagEnd) {
                foundTag = true;
                processImageTag(editor, line, tagStart, tagEnd, fullTag, attributes, false);
                return;
            }
            
            // Track the closest tag to cursor
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
            // Extract attributes (everything between <Image and /> or >)
            const attributesMatch = fullTag.match(/<Image\s+(.*?)(\/?>)/i);
            const attributes = attributesMatch ? attributesMatch[1] : '';
            const tagStart = match.index;
            const tagEnd = tagStart + fullTag.length;
            console.log(`Found Image tag: ${fullTag} at position ${tagStart}-${tagEnd}`);
            
            // Check if cursor is within this tag
            if (selection.active.character >= tagStart && selection.active.character <= tagEnd) {
                foundTag = true;
                processImageTag(editor, line, tagStart, tagEnd, fullTag, attributes, true);
                return;
            }
            
            // Track the closest tag to cursor
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
            // Extract attributes properly
            const attributesMatch = closestTag.isReact 
                ? fullTag.match(/<Image\s+(.*?)(\/?>)/i)
                : fullTag.match(/<img\s+(.*?)>/i);
            const attributes = attributesMatch ? attributesMatch[1] : '';
            const tagStart = match.index;
            const tagEnd = tagStart + fullTag.length;
            console.log(`Using closest tag: ${fullTag}`);
            processImageTag(editor, line, tagStart, tagEnd, fullTag, attributes, closestTag.isReact);
            return;
        }
        
        if (!foundTag) {
            console.log('No image tag found');
            vscode.window.showWarningMessage('No image tag found on this line. Please place your cursor on a line with an <img> or <Image> tag.');
        }
    });

    context.subscriptions.push(disposable);
}

function processImageTag(
    editor: vscode.TextEditor,
    line: vscode.TextLine,
    tagStart: number,
    tagEnd: number,
    fullTag: string,
    attributes: string,
    isReactComponent: boolean
) {
    // Check if alt attribute already exists
    const altRegex = /alt\s*=\s*["']([^"']*)["']/i;
    const altMatch = attributes.match(altRegex);
    
    let newTag: string;
    const placeholderAltText = "Descriptive alt text for image";
    
    if (altMatch) {
        // Replace existing alt text
        const newAttributes = attributes.replace(altRegex, `alt="${placeholderAltText}"`);
        newTag = isReactComponent 
            ? `<Image ${newAttributes} />`
            : `<img ${newAttributes}>`;
    } else {
        // Add alt attribute
        // Try to find src attribute to place alt near it
        const srcRegex = /src\s*=\s*["']([^"']*)["']/i;
        const srcMatch = attributes.match(srcRegex);
        
        if (srcMatch && srcMatch.index !== undefined) {
            // Insert alt after src
            const insertPosition = srcMatch.index + srcMatch[0].length;
            const newAttributes = 
                attributes.slice(0, insertPosition) + 
                ` alt="${placeholderAltText}"` + 
                attributes.slice(insertPosition);
            newTag = isReactComponent 
                ? `<Image ${newAttributes} />`
                : `<img ${newAttributes}>`;
        } else {
            // Just append alt attribute
            const trimmedAttributes = attributes.trim();
            const newAttributes = trimmedAttributes
                ? `${trimmedAttributes} alt="${placeholderAltText}"`
                : `alt="${placeholderAltText}"`;
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
    
    editor.edit(editBuilder => {
        editBuilder.replace(range, newTag);
    }).then(() => {
        vscode.window.showInformationMessage('Alt text generated successfully!');
    });
}

export function deactivate() {}
