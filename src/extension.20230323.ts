// npm install -g @vscode/vsce
"use strict"
import * as vscode from "vscode";
import { XMLParser } from "fast-xml-parser";

var output: vscode.OutputChannel;

class CoverageData {
	data: {
		// number[]: list of hits, array index being the line number. Lines
		// with -1 hits are not highlighted
		[filename: string]: number[]
	};
	updatedHandlers: { (): void }[];

	constructor() {
		this.data = {};
		console.info("Initializing update handlers")
		this.updatedHandlers = [];
	}

	empty() {
		this.data = {};
		this.triggerDataUpdated();
	}
	addForFile(filename: string, data: number[]): void {
		this.data[filename] = data;
	}
	getForFile(filename: string): number[] | undefined {
		return this.data[filename];
	}
	triggerDataUpdated(): void {
		console.info("Calling update handlers")
		this.updatedHandlers.forEach((callback) => {
			callback();
		});
	}

	onDataUpdated(callback: { (): void }): void {
		console.info("Adding to update handlers")
		this.updatedHandlers.push(callback);
	}
};

const coverage = new CoverageData();

export function activate(context: vscode.ExtensionContext) {

	// output = vscode.window.createOutputChannel("Coverage Markers");
	// output.show();

	console.info("Active");

	// vscode.workspace.onDidChangeConfiguration((change: vscode.ConfigurationChangeEvent) => {
	// 	if (change.affectsConfiguration("setting name"))
	//		do things
	// });

	let filePattern = new Settings().file;
	console.info(`Working with ${filePattern}`);

	let watcher = vscode.workspace.createFileSystemWatcher("**/coverage.xml", false, false, false);
	watcher.onDidChange(updateCoverageFromFile);
	watcher.onDidCreate(updateCoverageFromFile);
	watcher.onDidDelete((uri: vscode.Uri) => {
		coverage.empty();
	});

	vscode.workspace.findFiles("coverage.xml").then((values: vscode.Uri[]) => {
		console.info(`Alternatives ${values}`);
	});
	vscode.workspace.findFiles("**/coverage.xml").then((values: vscode.Uri[]) => {
		console.info(`Initiating from ${values}`);
		values.forEach(updateCoverageFromFile);
	});

	vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
		if (!editor) return;
		if (!editor.document.uri.fsPath) return;

		console.log("Switched to file", editor.document.uri.fsPath);
		updateOpenEditors();
	});

	coverage.onDataUpdated(updateOpenEditors);

	context.subscriptions.push(
		vscode.commands.registerCommand("py-coverage-markers.reloadCoverage", () => {
			vscode.workspace.findFiles("**/coverage.xml").then((values: vscode.Uri[]) => {
				values.forEach(updateCoverageFromFile);
			});
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }

function updateCoverageFromFile(uri: vscode.Uri): void {
	coverage.empty();

	switch (uri.fsPath.split(".").reverse()[0]) {
		case "xml":
			(new Ingester()).XML(uri).then(() => coverage.triggerDataUpdated());
			break;
		// case "json":
		// 	(new Ingester()).JSON(uri);
		// 	break;
		// case "lcov":
		// 	(new Ingester()).LCOV(uri);
		// 	break;
		default:
			console.error(`${uri.fsPath} filetype not supported`);
	}
}

function updateOpenEditors() {
	vscode.window.visibleTextEditors.forEach((editor: vscode.TextEditor) => {
		let filename = editor.document.uri.fsPath;

		let covered: Array<vscode.Range> = [];
		let missed: Array<vscode.Range> = [];

		console.info(`Updating editor for ${filename}`);
		let lineResults = [0, 0, 0];
		coverage.getForFile(filename)?.forEach((hits: number, lineNumber: number) => {
			if (hits === -1) {
				lineResults[0] += 1;
				return;
			}
			else if (hits === 0) {
				lineResults[1] += 1;
				missed.push(editor.document.lineAt(lineNumber).range);
			}
			else {
				lineResults[2] += 1;
				covered.push(editor.document.lineAt(lineNumber).range);
			}
		});
		console.info(`Updating editor for ${filename}; ${missed.length} missed, ${covered.length} covered (${lineResults})`);

		let settings = new Settings();
		if (settings.highlightCovered) {
			console.info(`Adding decorations for ${covered.length} covered lines`);
			editor.setDecorations(highlighters.getForCovered(filename), covered);
		}
		if (settings.highlightMissed) {
			console.info(`Adding decorations for ${missed.length} missed lines`);
			editor.setDecorations(highlighters.getForMissed(filename), missed);
		}
	});

}

class Settings {
	file: string;
	coveredColor: string;
	missedColor: string;
	highlightCovered: boolean;
	highlightMissed: boolean;

	constructor() {
		this.file = String(this.getSetting("file"));
		this.coveredColor = String(this.getSetting("coveredColor"));
		this.missedColor = String(this.getSetting("missedColor"));
		this.highlightCovered = Boolean(this.getSetting("highlightCovered"));
		this.highlightMissed = Boolean(this.getSetting("highlightMissed"));
	}

	getSetting(name: string): string | boolean | undefined {
		return vscode.workspace.getConfiguration().get(`python.coverageMarkers.${name}`)
	}
}

class Ingester {
	XML(uri: vscode.Uri): Thenable<void> {
		console.info("Ingesting file:", uri.fsPath);

		let parser: XMLParser = new XMLParser({
			ignoreAttributes: false,
			isArray: (name, jpath, isLeafNode, isAttribute) => {
				return ["source", "package", "class", "line"].indexOf(name) !== -1;
			}
		});

		return vscode.workspace.openTextDocument(uri).then((document) => {
			let xml = parser.parse(document.getText());
			if (Object.keys(xml).length === 0) return;
			console.info("Parsed XML");

			var sources: Array<string> = xml.coverage?.sources.source;

			xml.coverage.packages?.package.forEach((pkg: any) => {
				pkg.classes.class.forEach((cls: any) => {
					let lineData: number[] = [];

					cls.lines.line.forEach((line: any) => {
						let lineNumber = parseInt(line["@_number"]) - 1;
						while (lineData.length < lineNumber)
							lineData[lineData.length] = -1;
						lineData[lineNumber] = parseInt(line["@_hits"]);
					});

					sources.forEach((source: string) => {
						console.info("Adding line info for", `${source}/${cls["@_filename"]}`);
						coverage.addForFile(`${source}/${cls["@_filename"]}`, lineData);
					});
				});
			});
		});
	}
}

enum Highlights {
	COVERED = 1,
	MISSED = 2,
}

class FileHighlighters {
	highlighters: {
		[filename: string]: {
			[name: string]: vscode.TextEditorDecorationType
		}
	};
	constructor() {
		this.highlighters = {};
	}
	getForCovered(filename: string): vscode.TextEditorDecorationType {
		this.add(filename);
		return this.highlighters[filename].covered;
	}
	getForMissed(filename: string): vscode.TextEditorDecorationType {
		this.add(filename);
		return this.highlighters[filename].missed;
	}
	add(filename: string): void {
		this.remove(filename);
		console.info(`Adding new highlighters for ${filename}`);
		this.highlighters[filename] = {
			covered: this.createHighlighter(Highlights.COVERED),
			missed: this.createHighlighter(Highlights.MISSED),
		};
	}
	remove(filename: string): void {
		if (this.highlighters.hasOwnProperty(filename)) {
			console.info(`Removing old highlighters for ${filename}`);
			this.highlighters[filename].covered.dispose();
			this.highlighters[filename].missed.dispose();
			delete this.highlighters[filename];
		}
	}
	createHighlighter(color: Highlights): vscode.TextEditorDecorationType {
		let selectedColor: string | undefined;
		switch (color) {
			case Highlights.COVERED:
				selectedColor = new Settings().coveredColor;
				break;
			case Highlights.MISSED:
				selectedColor = new Settings().missedColor;
				break;
			default:
				selectedColor = "#FFFFFF";
		}
		return vscode.window.createTextEditorDecorationType({
			backgroundColor: selectedColor,
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
		});
	}
}

let highlighters = new FileHighlighters();
