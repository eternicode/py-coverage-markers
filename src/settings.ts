import * as vscode from "vscode";
import { boundMethod } from "autobind-decorator";

import { Updateable } from "./utils";

class Settings extends Updateable {
	private setting_section: string = "python.coverageMarkers";

	public file: string = "coverage.xml";
	public missedColor: string = "rgba(255,0,0,1)";
	public missedEnabled: boolean = true;
	public coveredColor: string = "rgba(0,255,0,1)";
	public coveredEnabled: boolean = false;
    public statusbarShowTotal: boolean = true;
    public statusbarShowMissed: boolean = false;
    public statusbarShowCovered: boolean = true;
    public statusbarShowPercent: boolean = true;
    public statusbarPercentPrecision: number = 2;
    public statusbarFullCoverageDopamine: boolean = true;

    public constructor() {
		super();

		this.loadSettings();

		vscode.workspace.onDidChangeConfiguration(this.settingsChanged);
	}

    @boundMethod
    private settingsChanged(change: vscode.ConfigurationChangeEvent): void {
        console.info("Settings updated");
        if (change.affectsConfiguration(this.setting_section)) {
            console.info("Settings updates affect us");
            this.loadSettings();
        }
    }

	private loadSettings(): void {
        console.info("Loading marker settings");
		this.file = String(this.getSetting("file"));
		this.missedColor = String(this.getSetting("missed.color"));
		this.missedEnabled = Boolean(this.getSetting("missed.enabled"));
		this.coveredColor = String(this.getSetting("covered.color"));
		this.coveredEnabled = Boolean(this.getSetting("covered.enabled"));
        this.statusbarShowTotal = Boolean(this.getSetting("statusbar.showTotal"));
        this.statusbarShowMissed = Boolean(this.getSetting("statusbar.showMissed"));
        this.statusbarShowCovered = Boolean(this.getSetting("statusbar.showCovered"));
        this.statusbarShowPercent = Boolean(this.getSetting("statusbar.showPercent"));
        this.statusbarPercentPrecision = Number(this.getSetting("statusbar.percentPrecision"));
        this.statusbarFullCoverageDopamine = Boolean(this.getSetting("statusbar.fullCoverageDopamine"));
        console.info("Settings:", this);
		this.triggerUpdate();
	}

	private getSetting(name: string): string | boolean | undefined {
		return vscode.workspace.getConfiguration().get(`${this.setting_section}.${name}`);
	}
}

export const settings = new Settings();
