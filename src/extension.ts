// npm install -g @vscode/vsce
import * as vscode from "vscode";
import { boundMethod } from "autobind-decorator";
import { debounce } from "typescript-debounce-decorator";

import { Updateable } from "./utils";
import { settings } from "./settings";
import { ingest } from "./ingesters";
import { highlighters } from "./markers";

var output: vscode.OutputChannel;

class CoverageData extends Updateable {
	data: {
		// number[]: list of hits, array index being the line number. Lines
		// with -1 hits are not highlighted
		[filename: string]: number[]
	};

	constructor() {
		super();

		this.data = {};
	}

	getForFile(filename: string): number[] {
		return this.data[filename] || [];
	}

	// Require at least 10ms between calls before triggering updates
	@debounce(10)
	protected triggerUpdate(): void {
		super.triggerUpdate();
	}

	empty() {
		this.data = {};
		this.triggerUpdate();
	}
	@boundMethod
	addForFile(filename: string, data: number[]): void {
		this.data[filename] = data;
		this.triggerUpdate();
	}
};

class Extension {
	coverage: CoverageData;
	statusbar: vscode.StatusBarItem;
	fileWatcher?: vscode.FileSystemWatcher;

	public constructor() {
		this.coverage = new CoverageData();
		// items that are secondary or contextual (language, spacing, feedback) go on the right.
		this.statusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	}

	@boundMethod
	public activate(context: vscode.ExtensionContext) {
		// output = vscode.window.createOutputChannel("Coverage Markers");
		// output.show();

		console.info("Active");

		// Update data on file changes
		this.updateFileWatcher();
		settings.onUpdate(this.updateFileWatcher);

		// Updates on user activity
		console.info(`Establishing user watcher`);
		vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
			console.log("Switched to file", editor?.document.uri.fsPath || editor?.document.uri);
			if (!editor || !editor.document.languageId)
				this.updateStatusBar(false);
			this.updateOpenEditors(this.coverage);
		});

		// Update editors when coverage data changes
		console.info(`Establishing coverage watcher`);
		this.coverage.onUpdate(this.updateOpenEditors);

		// Command for forcing an update
		console.info(`Establishing reload command`);
		let reloadCommand = vscode.commands.registerCommand(
			"py-coverage-markers.reloadCoverage",
			this.forceCoverageUpdate
		);

		// Let th context know about cleanup.
		console.info(`Establishing cleanup`);
		context.subscriptions.push(reloadCommand);
		context.subscriptions.push(this.statusbar);

		// Initial data load
		console.info(`Loading initial data`);
		this.forceCoverageUpdate();
	}

	@boundMethod
	public deactivate() {
		this.fileWatcher?.dispose();
	}

	@boundMethod
	private updateFileWatcher(): void {
		let filePath: string | vscode.RelativePattern = settings.file;
		if (settings.file.indexOf("*") === -1)
			filePath = `**/${settings.file}`;
		console.info(`Establishing file watcher for ${filePath}`);
		this.fileWatcher?.dispose();
		this.fileWatcher = vscode.workspace.createFileSystemWatcher(filePath, false, false, false);
		this.fileWatcher.onDidChange(this.updateCoverageFromFile);
		this.fileWatcher.onDidCreate(this.updateCoverageFromFile);
		this.fileWatcher.onDidDelete(this.updateCoverageFromFile);
	}

	@boundMethod
	private forceCoverageUpdate() {
		console.info(`Searching for files with ${settings.file}`);
		vscode.workspace.findFiles(settings.file, null, 1).then((values: vscode.Uri[]) => {
			console.info(`Forcing load from ${values[0]}`);
			this.updateCoverageFromFile(values[0]);
		});
	}

	@boundMethod
	private updateCoverageFromFile(uri: vscode.Uri | undefined): void {
		console.info(`Updating from file ${uri}`);
		this.coverage.empty();
		if (uri)
			ingest(uri, this.coverage.addForFile);
	}

	@boundMethod
	private updateOpenEditors(coverage: CoverageData): void {
		vscode.window.visibleTextEditors.forEach((editor: vscode.TextEditor) => {
			let filename = editor.document.uri.fsPath;

			let covered: Array<vscode.Range> = [];
			let missed: Array<vscode.Range> = [];

			console.info(`Updating editor for ${filename}`);
			let lineData = coverage.getForFile(filename);
			if (lineData.length === 0) {
				highlighters.clean(filename);
				this.updateStatusBar(false, editor.document.lineCount, 0);
				return;
			}

			lineData.forEach((hits: number, lineNumber: number) => {
				if (hits === -1) {
					return;
				}
				else if (hits === 0) {
					missed.push(editor.document.lineAt(lineNumber).range);
				}
				else {
					covered.push(editor.document.lineAt(lineNumber).range);
				}
			});
			console.info(`Updating editor for ${filename}; ${missed.length} missed, ${covered.length} covered`);

			highlighters.clean(filename);
			if (settings.missedEnabled) {
				console.info(`Adding decorations for ${missed.length} missed lines`);
				editor.setDecorations(highlighters.getForMissed(filename), missed);
			}
			if (settings.coveredEnabled) {
				console.info(`Adding decorations for ${covered.length} covered lines`);
				editor.setDecorations(highlighters.getForCovered(filename), covered);
			}

			if (vscode.window.activeTextEditor == editor)
				this.updateStatusBar(true, editor.document.lineCount, missed.length);
		});
	}

	@boundMethod
	private updateStatusBar(show: boolean, total: number = 0, misses: number = 0) {
		console.log(`Updating statusbar: show ${show}, totla ${total}, misses ${misses}`);
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
		let hits: number = total - misses;
		let percent: number = (hits / total) * 100;

		// Calculate display bits
		let missedDisplay: string = `-${misses.toLocaleString()}`;
		let hitsDisplay: string = `+${hits.toLocaleString()}`;
		let totalDisplay: string = total.toLocaleString();
		let percentDisplay: string;
		if (percent == 100) {
			if (settings.statusbarFullCoverageDopamine) {
				// Little dopamine hit on full coverage
				this.statusbar.text = "✅%";
				return;
			}
			else {
				percentDisplay = "100";
			}
		} else if (percent < 10) {
			percentDisplay = percent.toPrecision(settings.statusbarPercentPrecision + 1);
		} else {
			percentDisplay = percent.toPrecision(settings.statusbarPercentPrecision + 2);
		}

		// Construct display
		let text: string = "";
		if (settings.statusbarShowCovered && settings.statusbarShowMissed) {
			if (settings.statusbarShowTotal) {
				text += `(${hitsDisplay}, ${missedDisplay})`;
			}
			else {
				text += `${hitsDisplay}, ${missedDisplay}`;
			}
		}
		else if (settings.statusbarShowCovered) {
			text += hitsDisplay;
		}
		else if (settings.statusbarShowMissed) {
			text += missedDisplay;
		}
		if (settings.statusbarShowTotal) {
			if (settings.statusbarShowCovered || settings.statusbarShowMissed) {
				text += `/${totalDisplay}`;
			}
			else {
				text += totalDisplay;
			}
		}
		text += " ";
		if (settings.statusbarShowPercent) {
			text += `${percentDisplay}%`;
		}

		// show hits: 1,000/1,200 %80
		// show misses: -200/1,200 %80
		// show hits + misses: (1,000, -200)/1,200 %80
		// show hits + misses - total: 1,000, -200 %80
		this.statusbar.text = text.replace(/\s+/, " ").trim();
		this.statusbar.tooltip = `Coverage: ${totalDisplay} lines, ${hitsDisplay} covered, ${missedDisplay} missed, ${percentDisplay}%`;
	}
}

const extension = new Extension();

export const activate = extension.activate;
export const deactivate = extension.deactivate;
