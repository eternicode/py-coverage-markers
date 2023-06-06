import * as vscode from 'vscode';
import { boundMethod } from 'autobind-decorator';
import { Updateable } from './utils.js';

class Settings extends Updateable {
  private get settingSection() {
    return 'python.coverageMarkers';
  }

  public file = 'coverage.xml';
  public missedColor = 'rgba(255,0,0,1)';
  public missedEnabled = true;
  public coveredColor = 'rgba(0,255,0,1)';
  public coveredEnabled = false;
  public statusbarShowTotal = true;
  public statusbarShowMissed = false;
  public statusbarShowCovered = true;
  public statusbarShowPercent = true;
  public statusbarPercentPrecision = 2;
  public statusbarFullCoverageDopamine = true;

  public constructor() {
    super();

    this.loadSettings();

    vscode.workspace.onDidChangeConfiguration(this.settingsChanged);
  }

  @boundMethod
  private settingsChanged(change: vscode.ConfigurationChangeEvent): void {
    console.info('Settings updated');
    if (change.affectsConfiguration(this.settingSection)) {
      console.info('Settings updates affect us');
      this.loadSettings();
    }
  }

  private loadSettings(): void {
    console.info('Loading marker settings');
    this.file = String(this.getSetting('file'));
    this.missedColor = String(this.getSetting('missed.color'));
    this.missedEnabled = Boolean(this.getSetting('missed.enabled'));
    this.coveredColor = String(this.getSetting('covered.color'));
    this.coveredEnabled = Boolean(this.getSetting('covered.enabled'));
    this.statusbarShowTotal = Boolean(this.getSetting('statusbar.showTotal'));
    this.statusbarShowMissed = Boolean(this.getSetting('statusbar.showMissed'));
    this.statusbarShowCovered = Boolean(
      this.getSetting('statusbar.showCovered'),
    );
    this.statusbarShowPercent = Boolean(
      this.getSetting('statusbar.showPercent'),
    );
    this.statusbarPercentPrecision = Number(
      this.getSetting('statusbar.percentPrecision'),
    );
    this.statusbarFullCoverageDopamine = Boolean(
      this.getSetting('statusbar.fullCoverageDopamine'),
    );
    console.info('Settings:', this);
    this.triggerUpdate();
  }

  private getSetting(name: string): string | boolean | undefined {
    return vscode.workspace
      .getConfiguration()
      .get(`${this.settingSection}.${name}`);
  }
}

export const settings = new Settings();
