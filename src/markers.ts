import * as vscode from "vscode";
import { settings } from "./settings";

interface Marker {
	missed: vscode.TextEditorDecorationType,
	missedColor: string,
	covered: vscode.TextEditorDecorationType,
	coveredColor: string,
};

class MarkerCase {
	private library: {
		[filename: string]: Marker,
	};

	public constructor() {
		this.library = {};
	}

    public clean(filename: string): void {
        console.info(`Cleaning markers for ${filename}`);
		let marker = this.library[filename];
        if (!marker) return;

        marker.missed.dispose();
        marker.covered.dispose();
        delete this.library[filename];
    }
	public getForCovered(filename: string): vscode.TextEditorDecorationType {
		this.verify(filename);
		return this.library[filename].covered;
	}
	public getForMissed(filename: string): vscode.TextEditorDecorationType {
		this.verify(filename);
		return this.library[filename].missed;
	}

	private verify(filename: string): Marker {
		/**
		 * Verify that the highlighters for filename a) exist and b) have the correct color
		 */
		let marker = this.library[filename];
		if (!marker) {
            console.info(`Creating fresh markers for ${filename}`);
			marker = {
				missed: this.createHighlighter(settings.missedColor),
				missedColor: settings.missedColor,
				covered: this.createHighlighter(settings.coveredColor),
				coveredColor: settings.coveredColor,
			};
        }

		if (marker.missedColor != settings.missedColor) {
			console.info(`Cycling --missed-- marker for ${filename}`);
			marker.missed.dispose();
			marker.missed = this.createHighlighter(settings.missedColor);
			marker.missedColor = settings.missedColor;
		}
		if (marker.coveredColor != settings.coveredColor) {
			console.info(`Cycling --covered-- marker for ${filename}`);
			marker.covered.dispose();
			marker.covered = this.createHighlighter(settings.coveredColor);
			marker.coveredColor = settings.coveredColor;
		}

		return (this.library[filename] = marker);
	}

	private createHighlighter(color: string): vscode.TextEditorDecorationType {
		return vscode.window.createTextEditorDecorationType({
			backgroundColor: color,
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
		});
	}
}

export const highlighters = new MarkerCase();
