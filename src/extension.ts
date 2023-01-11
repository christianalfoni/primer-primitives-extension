import * as vscode from 'vscode';
import * as Dot from 'dot-object';

import baseSizeSpaceTokens from './primitives-copy/base/size-space';
import functionalSizeSpaceTokens from './primitives-copy/functional/size-space';

const dot = new Dot('-');
const baseSizeSpaceVariables = dot.dot(baseSizeSpaceTokens);
const functionalSizeSpaceVariables = dot.dot(functionalSizeSpaceTokens);
const sizeSpaceVariables = { ...functionalSizeSpaceVariables, ...baseSizeSpaceVariables };

const selector = { scheme: 'file', pattern: '**/*.{css,scss,less,sass}' };

const emojis = ['👀', '😬', '😢', '😭', '🥲', '🤕', '😳', '😨', '😮', '🙈', '🙉', '😅'];
const randomEmoji = () => emojis[Math.floor(Math.random() * emojis.length)];

const getLineText = (document: vscode.TextDocument, position: vscode.Position) => {
  return document.lineAt(position.line).text;
};

const getCSSProperty = (lineText: string) => {
  return lineText.split(':')[0].trim();
};

const getCSSValueFromLineText = (lineText: string) => {
  return lineText.split(':')[1].replace(';', '').trim();
};

const remToPx = (remValue: string) => {
  return parseFloat(remValue) * 16 + 'px';
};

const getVariableDescription = (variable: string) => {
  // variables start with --, but dot object keys don't
  const value = sizeSpaceVariables[variable.replace('--', '')];
  const pxValue = parseFloat(value) * 16 + 'px';

  return `
    ${variable}
    output value: ${value}, source value: ${pxValue}
  `;
};

const getVariableReference = (variable: string) => {
  // TODO
  return `[Primer reference](https://primer.style/primitives/spacing)`;
};

const stripFallback = (variable: string) => {
  return variable.split(',')[0];
};

const getCSSVariablesFromLineText = (lineText: string) => {
  const regexp = /var\(([a-z-A-Z-0-9,\s]+)\)/g;

  const matches = [...lineText.matchAll(regexp)];
  const variables = matches.map(([_, match]) => match).map(stripFallback);
  return variables;
};

const filterScale = (scale: { [key: string]: any }, queryString: string) => {
  return Object.fromEntries(
    Object.keys(scale)
      .filter((variable) => variable.includes(queryString))
      .map((variable) => [variable, scale[variable]])
  );
};

const propertiesMap: { [key: string]: any } = {
  margin: { ...filterScale(functionalSizeSpaceVariables, 'gap'), ...baseSizeSpaceVariables },
  'margin-top': { ...filterScale(functionalSizeSpaceVariables, 'gap'), ...baseSizeSpaceVariables },
  'margin-right': { ...filterScale(functionalSizeSpaceVariables, 'gap'), ...baseSizeSpaceVariables },
  'margin-bottom': { ...filterScale(functionalSizeSpaceVariables, 'gap'), ...baseSizeSpaceVariables },
  'margin-left': { ...filterScale(functionalSizeSpaceVariables, 'gap'), ...baseSizeSpaceVariables },
  'margin-inline-start': { ...filterScale(functionalSizeSpaceVariables, 'gap'), ...baseSizeSpaceVariables },
  'margin-inline-end': { ...filterScale(functionalSizeSpaceVariables, 'gap'), ...baseSizeSpaceVariables },
  gap: { ...filterScale(functionalSizeSpaceVariables, 'gap'), ...baseSizeSpaceVariables },
  padding: { ...filterScale(functionalSizeSpaceVariables, 'padding'), ...baseSizeSpaceVariables },
  'padding-top': { ...filterScale(functionalSizeSpaceVariables, 'padding'), ...baseSizeSpaceVariables },
  'padding-right': { ...filterScale(functionalSizeSpaceVariables, 'padding'), ...baseSizeSpaceVariables },
  'padding-bottom': { ...filterScale(functionalSizeSpaceVariables, 'padding'), ...baseSizeSpaceVariables },
  'padding-left': { ...filterScale(functionalSizeSpaceVariables, 'padding'), ...baseSizeSpaceVariables },
  'padding-inline-start': { ...filterScale(functionalSizeSpaceVariables, 'padding'), ...baseSizeSpaceVariables },
  'padding-inline-end': { ...filterScale(functionalSizeSpaceVariables, 'padding'), ...baseSizeSpaceVariables },
  width: sizeSpaceVariables,
  'max-width': sizeSpaceVariables,
  'min-width': sizeSpaceVariables,
  height: sizeSpaceVariables,
  'max-height': sizeSpaceVariables,
  'min-height': sizeSpaceVariables
};

const getVariablesScale = (cssProperty: string) => propertiesMap[cssProperty];

const completionItemProvider: vscode.CompletionItemProvider = {
  provideCompletionItems: (document, position) => {
    const lineText = getLineText(document, position);
    const cssProperty = getCSSProperty(lineText);

    const scaleVariables = getVariablesScale(cssProperty);
    if (!scaleVariables) return;

    return Object.keys(scaleVariables).map((variable) => {
      const description = scaleVariables[variable];
      return {
        label: { label: variable, description },
        sortText: '.',
        kind: vscode.CompletionItemKind.Variable,
        insertText: ` var(--${variable})`,
        detail: description
      };
    });
  }
};

const hoverDescriptionProvider: vscode.HoverProvider = {
  provideHover(document, position) {
    const lineText = getLineText(document, position);
    const variables = getCSSVariablesFromLineText(lineText);

    const variableHovered = variables.find((variable) => {
      const startPosition = lineText.indexOf(variable) - 'var(--'.length;
      const endPosition = lineText.indexOf(variable) + variable.length + ')'.length;
      return position.character >= startPosition && position.character <= endPosition;
    });

    if (!variableHovered) return;

    const description = getVariableDescription(variableHovered);
    if (!description) return;

    const contents = [description, getVariableReference(variableHovered)];
    return { contents };
  }
};

const primitivesDiagnostics = vscode.languages.createDiagnosticCollection('primer/primitives');
const refreshDiagnostics = () => {
  const document = vscode.window.activeTextEditor?.document;
  if (document?.languageId !== 'css') return;

  const diagnostics: vscode.Diagnostic[] = [];

  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
    const lineText = document.lineAt(lineIndex).text;

    const suggestions = getDiagnosticSuggestions(lineText);
    suggestions.forEach((suggestion) => diagnostics.push(createDiagnostic(lineIndex, lineText, suggestion)));
  }

  primitivesDiagnostics.set(document.uri, diagnostics);
};

type Suggestion = {
  original: string;
  message: string;
  replacements: Array<{ value: string; description: string }>;
  severity: vscode.DiagnosticSeverity;
  reference?: string;
};
const getDiagnosticSuggestions = (lineText: string) => {
  const cssProperty = getCSSProperty(lineText);
  const suggestions: Array<Suggestion> = [];

  // we have nothing to say about this property
  if (typeof propertiesMap[cssProperty] === 'undefined') return suggestions;

  const cssValue = getCSSValueFromLineText(lineText);
  // ignore comment
  if (cssValue.includes('ignore primer/primitives')) return suggestions;

  const cssVariables = getCSSVariablesFromLineText(lineText);
  const scaleVariables = getVariablesScale(cssProperty);

  // scenarios:
  // 1. Warning: base to functional
  cssVariables.forEach((cssVariable) => {
    if (cssVariable.includes('base-size')) {
      const rawValue = scaleVariables[cssVariable.replace('--', '')];
      if (!rawValue) return;
      if (!scaleVariables) return;

      // find variable for value
      const functionalVariables = Object.keys(scaleVariables).filter((variable) => {
        return scaleVariables[variable] === rawValue && !variable.includes('base');
      });

      if (functionalVariables.length === 0) return;

      suggestions.push({
        original: cssVariable,
        message: `${randomEmoji()} You're using ${cssVariable}, prefer using functional primitive instead. \nExample: ${
          functionalVariables[0]
        }`,
        replacements: functionalVariables.map((variable) => ({
          value: '--' + variable,
          description: `Replace with ${variable} (${rawValue})`
        })),
        reference: getVariableReference(cssVariable),
        severity: vscode.DiagnosticSeverity.Warning
      });
    }

    // 1.5 not base, but incorrect property
    if (
      !Object.keys(scaleVariables).includes(cssVariable.replace('--', '')) &&
      Object.keys(sizeSpaceVariables).includes(cssVariable.replace('--', ''))
    ) {
      const rawValue = sizeSpaceVariables[cssVariable.replace('--', '')];
      if (!rawValue) return;

      const correctScaleVariable = propertiesMap[cssProperty];
      // find variable for value
      const functionalVariables = Object.keys(correctScaleVariable).filter((variable) => {
        return correctScaleVariable[variable] === rawValue;
      });

      if (functionalVariables.length > 0) {
        suggestions.push({
          original: cssVariable,
          message: `${randomEmoji()} Using ${cssVariable}, which is not recommended for ${cssProperty}, prefer using ${cssProperty} primitives. Example: ${
            functionalVariables[0]
          }`,
          replacements: functionalVariables.map((variable) => ({
            value: '--' + variable,
            description: `Replace with ${variable} (${rawValue})`
          })),
          reference: getVariableReference(cssVariable),
          severity: vscode.DiagnosticSeverity.Error
        });
      }
    }
  });

  // the things after that isn't related to css variables
  if (cssVariables.length > 0) return suggestions;

  // 2. Error: custom to token should be an error, fix: replace
  let cssValueInRem: string;
  if (cssValue.endsWith('rem')) cssValueInRem = cssValue;
  if (cssValue.endsWith('px')) cssValueInRem = parseInt(cssValue.replace('px', ''), 10) / 16 + 'rem';
  else; // we don't deal with other units yet

  // find variable for value
  const primitiveVariables = Object.keys(scaleVariables).filter((variable) => {
    return scaleVariables[variable] === cssValueInRem;
  });

  if (primitiveVariables.length > 0) {
    suggestions.push({
      original: cssValue,
      message: `${randomEmoji()} You're using a custom value, prefer using functional variable instead. \nExample: ${
        primitiveVariables[0]
      }`,
      replacements: primitiveVariables.map((variable) => ({
        value: `var(--${variable})`,
        description: `Replace with ${variable} (${cssValueInRem})`
      })),
      reference: getVariableReference(primitiveVariables[0]),
      severity: vscode.DiagnosticSeverity.Error
    });
  } else {
    // TODO: 3. Warning: custom without token, fix: add ignore statement
    if (!['0', '0px'].includes(cssValue)) {
      let cssValueInRem: string | null = null;
      if (cssValue.endsWith('rem')) cssValueInRem = cssValue;
      if (cssValue.endsWith('px')) cssValueInRem = parseInt(cssValue.replace('px', ''), 10) / 16 + 'rem';
      else; // we don't deal with other units yet

      if (cssValueInRem !== null) {
        const closestVariablesOnScale = Object.keys(scaleVariables)
          .map((variable) => {
            const value = scaleVariables[variable];
            const a = value.replace('rem', '');
            const b = (cssValueInRem as string).replace('rem', '');

            const diff = Math.abs(parseFloat(a) - parseFloat(b));
            return { variable, value, diff };
          })
          .sort((a, b) => (a.diff > b.diff ? 1 : -1))
          .slice(0, 5);

        suggestions.push({
          original: cssValue,
          message: `${randomEmoji()} You're using a custom value not on the scale, prefer using a primitive from the scale instead. \n\nIf this value is intentional, please supress this warning (see quick fix)`,
          replacements: [
            {
              // ignore comment
              value: cssValue + '; /* ignore primer/primitives */',
              description: 'Ignore primer/primitives for this line'
            },
            ...closestVariablesOnScale.map(({ variable, value }) => ({
              value: `var(--${variable})`,
              description: `Replace with nearby value ${value} = ${remToPx(value)} (${variable})`
            }))
          ],
          reference: getVariableReference(''),
          severity: vscode.DiagnosticSeverity.Error
        });
      }
    }
  }

  return suggestions;
};

function createDiagnostic(lineIndex: number, lineText: string, suggestion: Suggestion) {
  const index = lineText.indexOf(suggestion.original);
  const range = new vscode.Range(lineIndex, index, lineIndex, index + suggestion.original.length);

  const diagnostic = new vscode.Diagnostic(range, suggestion.message, suggestion.severity);
  diagnostic.code = 'primer/primitives';

  // diagnostic.source = 'primer/primitives';
  // diagnostic.tags

  return diagnostic;
}

const codeActionsProvider: vscode.CodeActionProvider = {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const codeActions: vscode.CodeAction[] = [];

    context.diagnostics
      .filter((diagnostic) => diagnostic.code === 'primer/primitives')
      .forEach((diagnostic) => {
        const lineText = document.lineAt(range.start.line).text;
        const suggestions = getDiagnosticSuggestions(lineText);

        suggestions.forEach((suggestion) => {
          if (suggestion.replacements.length === 0) return;
          suggestion.replacements.forEach((replacement) => {
            const title = replacement.description;
            const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diagnostic];
            action.edit = new vscode.WorkspaceEdit();
            action.edit.replace(document.uri, diagnostic.range, replacement.value);
            codeActions.push(action);
          });
        });
      });

    return codeActions;
  }
};

export function activate(context: vscode.ExtensionContext) {
  refreshDiagnostics();
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, completionItemProvider, ':'),
    vscode.languages.registerHoverProvider(selector, hoverDescriptionProvider),
    vscode.workspace.onDidChangeTextDocument(refreshDiagnostics),
    vscode.languages.registerCodeActionsProvider(selector, codeActionsProvider)
  );
}

export function deactivate() {}

// squigglies: https://github.com/microsoft/vscode-extension-samples/blob/main/code-actions-sample/src/extension.ts
