// Npm install -g @vscode/vsce
import * as vscode from 'vscode';
import { boundMethod } from 'autobind-decorator';
import { debounce } from 'typescript-debounce-decorator';
import { Updateable } from './utils.js';
import { settings } from './settings.js';
import { ingest } from './ingesters.js';
import { highlighters } from './markers.js';

// let output: vscode.OutputChannel;

class CoverageData extends Updateable {
  // number[]: list of hits, array index being the line number. Lines
  // with -1 hits are not instrumented, and neither hit nor missed
  data: Record<string, number[]>;

  constructor() {
    super();

    this.data = {};
  }

  @boundMethod
  addForFile(filename: string, data: number[]): void {
    this.data[filename] = data;
    this.triggerUpdate();
  }

  getForFile(filename: string): number[] {
    return this.data[filename] ?? [];
  }

  empty(): void {
    this.data = {};
    this.triggerUpdate();
  }

  // Require at least 10ms between calls before triggering updates
  @debounce(10)
  protected triggerUpdate(): void {
    super.triggerUpdate();
  }
}

class Extension {
  coverage: CoverageData;
  statusbar: vscode.StatusBarItem;
  fileWatcher?: vscode.FileSystemWatcher;

  public constructor() {
    this.coverage = new CoverageData();
    // Items that are secondary or contextual (language, spacing, feedback) go on the right.
    this.statusbar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
    );
  }

  @boundMethod
  public activate(context: vscode.ExtensionContext): void {
    // Output = vscode.window.createOutputChannel("Coverage Markers");
    // output.show();

    console.info('Active');

    // Update data on file changes
    this.updateFileWatcher();
    settings.onUpdate(this.updateFileWatcher);

    // Updates on user activity
    console.info('Establishing user watcher');
    vscode.window.onDidChangeActiveTextEditor(
      (editor: vscode.TextEditor | undefined) => {
        console.log(
          'Switched to file %s',
          editor?.document.uri.fsPath ?? editor?.document.uri,
        );
        if (editor === null || !editor?.document.languageId) {
          this.updateStatusBar(false);
        }

        this.updateOpenEditors(this.coverage);
      },
    );

    // Update editors when coverage data changes
    console.info('Establishing coverage watcher');
    this.coverage.onUpdate(this.updateOpenEditors);

    // Command for forcing an update
    console.info('Establishing reload command');
    const reloadCommand = vscode.commands.registerCommand(
      'py-coverage-markers.reloadCoverage',
      this.forceCoverageUpdate,
    );

    // Let th context know about cleanup.
    console.info('Establishing cleanup');
    context.subscriptions.push(reloadCommand, this.statusbar);

    // Initial data load
    console.info('Loading initial data');
    this.forceCoverageUpdate();
  }

  @boundMethod
  public deactivate(): void {
    this.fileWatcher?.dispose();
  }

  @boundMethod
  private updateFileWatcher(): void {
    let filePath: string | vscode.RelativePattern = settings.file;
    if (!settings.file.includes('*')) filePath = `**/${settings.file}`;
    console.info(`Establishing file watcher for ${filePath}`);
    this.fileWatcher?.dispose();
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      filePath,
      false,
      false,
      false,
    );
    this.fileWatcher.onDidChange(this.updateCoverageFromFile);
    this.fileWatcher.onDidCreate(this.updateCoverageFromFile);
    this.fileWatcher.onDidDelete(this.updateCoverageFromFile);
  }

  @boundMethod
  private forceCoverageUpdate(): void {
    console.info(`Searching for files with ${settings.file}`);
    vscode.workspace.findFiles(settings.file, null, 1).then(
      (values: vscode.Uri[]) => {
        console.info(`Forcing load from ${values[0].fsPath}`);
        this.updateCoverageFromFile(values[0]);
      },
      (error: any) => {
        console.error(error);
      },
    );
  }

  @boundMethod
  private updateCoverageFromFile(uri: vscode.Uri | undefined): void {
    console.info(`Updating from file ${uri?.fsPath ?? ''}`);
    this.coverage.empty();
    if (uri !== undefined) ingest(uri, this.coverage.addForFile);
  }

  @boundMethod
  private updateOpenEditors(coverage: CoverageData): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const filename = editor.document.uri.fsPath;

      const covered: vscode.Range[] = [];
      const missed: vscode.Range[] = [];

      console.info(`Updating editor for ${filename}`);
      const lineData = coverage.getForFile(filename);
      if (lineData.length === 0) {
        highlighters.clean(filename);
        this.updateStatusBar(false, editor.document.lineCount, 0);
        return;
      }

      for (const [lineNumber, hits] of lineData.entries()) {
        if (hits === -1) {
          // Line not instrumented
        } else if (hits === 0) {
          missed.push(editor.document.lineAt(lineNumber).range);
        } else {
          covered.push(editor.document.lineAt(lineNumber).range);
        }
      }

      console.info(
        `Updating editor for ${filename}; ${missed.length} missed, ${covered.length} covered`,
      );

      highlighters.clean(filename);
      if (settings.missedEnabled) {
        console.info(`Adding decorations for ${missed.length} missed lines`);
        editor.setDecorations(highlighters.getForMissed(filename), missed);
      }

      if (settings.coveredEnabled) {
        console.info(`Adding decorations for ${covered.length} covered lines`);
        editor.setDecorations(highlighters.getForCovered(filename), covered);
      }

      if (vscode.window.activeTextEditor === editor) {
        this.updateStatusBar(true, editor.document.lineCount, missed.length);
      }
    }
  }

  @boundMethod
  private updateStatusBar(show: boolean, total = 0, misses = 0): void {
    console.log(
      'Updating statusbar: show %s, total %s, misses %s',
      show,
      total,
      misses,
    );
    if (show) {
      this.statusbar.show();
    } else {
      this.statusbar.hide();
    }

    if (total === 0) {
      this.statusbar.hide();
      return;
    }

    // "covered" stat doesn't include unmeasured lines; total - misses does.
    const hits: number = total - misses;
    const percent: number = (hits / total) * 100;

    // Calculate display bits
    const missedDisplay = `-${misses.toLocaleString()}`;
    const hitsDisplay = `+${hits.toLocaleString()}`;
    const totalDisplay: string = total.toLocaleString();
    let percentDisplay: string;
    if (percent === 100) {
      if (settings.statusbarFullCoverageDopamine) {
        // Little dopamine hit on full coverage
        this.statusbar.text = '✅%';
        return;
      }

      percentDisplay = '100';
    } else if (percent < 10) {
      percentDisplay = percent.toPrecision(
        settings.statusbarPercentPrecision + 1,
      );
    } else {
      percentDisplay = percent.toPrecision(
        settings.statusbarPercentPrecision + 2,
      );
    }

    // Construct display
    let text = '';
    if (settings.statusbarShowCovered && settings.statusbarShowMissed) {
      text += settings.statusbarShowTotal
        ? `(${hitsDisplay}, ${missedDisplay})`
        : `${hitsDisplay}, ${missedDisplay}`;
    } else if (settings.statusbarShowCovered) {
      text += hitsDisplay;
    } else if (settings.statusbarShowMissed) {
      text += missedDisplay;
    }

    if (settings.statusbarShowTotal) {
      text +=
        settings.statusbarShowCovered || settings.statusbarShowMissed
          ? `/${totalDisplay}`
          : totalDisplay;
    }

    text += ' ';
    if (settings.statusbarShowPercent) {
      text += `${percentDisplay}%`;
    }

    // Show hits: 1,000/1,200 %80
    // show misses: -200/1,200 %80
    // show hits + misses: (1,000, -200)/1,200 %80
    // show hits + misses - total: 1,000, -200 %80
    this.statusbar.text = text.replace(/\s+/, ' ').trim();
    this.statusbar.tooltip = `Coverage: ${totalDisplay} lines, ${hitsDisplay} covered, ${missedDisplay} missed, ${percentDisplay}%`;
  }
}

const extension = new Extension();

export const activate = extension.activate;
export const deactivate = extension.deactivate;
