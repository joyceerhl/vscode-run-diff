import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Run and Diff');

  let disposable = vscode.commands.registerCommand('vscode-run-diff.runDiff', async () => {
    // Ensure file is saved before attempting to run it
    await vscode.workspace.saveAll(false);
    const activePythonFile = vscode.window.activeTextEditor;
    if (activePythonFile?.document.languageId !== 'python') {
      return;
    }

    // Get file containing expected program output
    const expectedFilePath = await getExpectedOutputFile(outputChannel);

    const setCwd = vscode.workspace.getConfiguration('python.terminal').get<boolean>('executeInFileDir')
      ? `cd ${path.dirname(activePythonFile.document.uri.fsPath)} && `
      : '';

    // Run active text editor
    cp.exec(`${setCwd}python3 ${activePythonFile.document.uri.fsPath}`, async (err, stdout) => {
      if (err) {
        await vscode.window.showErrorMessage(`Encountered error while executing Python code: ${err.message}`);
        outputChannel.append(`Error: ${err.name} ${err.message}`);
      } else {
        // Dump stdout into untitled file
        let actualOutputDocument = vscode.workspace.textDocuments.find((document) => document.languageId === 'python-run-diff');
        if (actualOutputDocument) {
          const edit = new vscode.WorkspaceEdit();
          edit.replace(actualOutputDocument.uri, new vscode.Range(0, 0, actualOutputDocument.lineCount, 0), stdout);
          await vscode.workspace.applyEdit(edit);
        }
        const actualFilePath = actualOutputDocument ?? await vscode.workspace.openTextDocument({ content: stdout, language: 'python-run-diff' });
        await vscode.commands.executeCommand(
          'vscode.diff',
          expectedFilePath,
          actualFilePath.uri,
          'Expected vs Actual Output',
          { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true, preview: true }
        );
      }
    });
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }

async function getExpectedOutputFile(outputChannel: vscode.OutputChannel): Promise<vscode.Uri | undefined> {
  let outputFile: vscode.Uri | undefined;
  const setting = vscode.workspace.getConfiguration('vscode-run-diff').get<string>('expectedOutputFilePath');
  if (setting) {
    const file = vscode.Uri.file(setting);
    try {
      await vscode.workspace.fs.stat(file);
      outputFile = file;
    } catch (e: unknown) {
      // File does not exist, log error to output channel
      outputChannel.append(`vscode-run-diff.expectedOutputFilePath setting value does not correspond to a valid filepath on disk: ${setting}`);
    }
  }

  if (!outputFile) {
    const selections = await vscode.window.showOpenDialog({ title: 'Select file containing expected program output', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, });
    if (selections && selections?.length === 1) {
      outputFile = selections[0];
    }
  }

  return outputFile;
}