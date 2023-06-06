import * as vscode from 'vscode';
import { settings } from './settings.js';

type Marker = {
  missed: vscode.TextEditorDecorationType;
  missedColor: string;
  covered: vscode.TextEditorDecorationType;
  coveredColor: string;
};

class MarkerCase {
  private readonly library: Map<string, Marker>;

  public constructor() {
    this.library = new Map();
  }

  public clean(filename: string): void {
    console.info(`Cleaning markers for ${filename}`);
    const marker: Marker | undefined = this.library.get(filename);
    if (marker === undefined) return;

    marker.missed.dispose();
    marker.covered.dispose();
    this.library.delete(filename);
  }

  public getForCovered(filename: string): vscode.TextEditorDecorationType {
    this.verify(filename);

    const marker = this.library.get(filename);
    if (marker === undefined)
      throw new Error(`No marker found for ${filename}`);
    return marker.covered;
  }

  public getForMissed(filename: string): vscode.TextEditorDecorationType {
    this.verify(filename);

    const marker = this.library.get(filename);
    if (marker === undefined)
      throw new Error(`No marker found for ${filename}`);
    return marker.missed;
  }

  private verify(filename: string): Marker {
    /**
     * Verify that the highlighters for filename a) exist and b) have the correct color
     */
    let marker: Marker | undefined = this.library.get(filename);
    if (marker === undefined) {
      console.info(`Creating fresh markers for ${filename}`);
      marker = {
        missed: this.createHighlighter(settings.missedColor),
        missedColor: settings.missedColor,
        covered: this.createHighlighter(settings.coveredColor),
        coveredColor: settings.coveredColor,
      };
    }

    if (marker.missedColor !== settings.missedColor) {
      console.info(`Cycling --missed-- marker for ${filename}`);
      marker.missed.dispose();
      marker.missed = this.createHighlighter(settings.missedColor);
      marker.missedColor = settings.missedColor;
    }

    if (marker.coveredColor !== settings.coveredColor) {
      console.info(`Cycling --covered-- marker for ${filename}`);
      marker.covered.dispose();
      marker.covered = this.createHighlighter(settings.coveredColor);
      marker.coveredColor = settings.coveredColor;
    }

    this.library.set(filename, marker);

    return marker;
  }

  private createHighlighter(color: string): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
      backgroundColor: color,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }
}

export const highlighters = new MarkerCase();
