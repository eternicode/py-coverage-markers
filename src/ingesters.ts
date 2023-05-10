import * as vscode from "vscode";
import { XMLParser } from "fast-xml-parser";

interface Callback {
    /**
     * Callback spec for ingesters.
     *
     * Callbacks are called with each filename and line data extracted during
     * parsing. "line data" is a list of numbers, one number per line in the
     * file:
     *
     * - -1 for "line not measured"
     * - 0 for "line missed"
     * - a positive integer for "line covered"
     */
    (filename: string, lineData: number[]): void
};

export function ingest(uri: vscode.Uri, callback: Callback, thisArg?: any): void {
    /**
     * Ingest a file with the appropriate ingester, calling callback with results.
     *
     * The .coverage file is a sqlite database, whose contents are considered
     * an implementation detail, and cannot be trusted as a public interface.
     * Therefore, we do not try to parse it.
     */
	switch (uri.fsPath.split(".").reverse()[0]) {
		case "xml":
			XML(uri, callback);
			break;
		// case "json":
		// 	JSON(uri, callback);
		// 	break;
		// case "lcov":
		// 	LCOV(uri, callback);
		// 	break;
		default:
			console.error(`${uri.fsPath} filetype not supported`);
	}
}

function XML(uri: vscode.Uri, callback: Callback): void {
    console.info("Ingesting file:", uri.fsPath);

    let parser: XMLParser = new XMLParser({
        ignoreAttributes: false,
        isArray: (name, jpath, isLeafNode, isAttribute) => {
            return ["source", "package", "class", "line"].indexOf(name) !== -1;
        }
    });

    vscode.workspace.openTextDocument(uri).then((document) => {
        let xml = parser.parse(document.getText());
        if (Object.keys(xml).length === 0) {
            console.info("XML file didn't parse");
            return;
        }
        console.info("Parsed XML");

        var sources: Array<string> = xml.coverage.sources.source;

        xml.coverage.packages.package.forEach((pkg: any) => {
            pkg.classes.class.forEach((cls: any) => {
                let lineData: number[] = [];

                cls.lines.line.forEach((line: any) => {
                    let lineNumber = parseInt(line["@_number"]) - 1;
                    while (lineData.length < lineNumber)
                        lineData[lineData.length] = -1;
                    lineData[lineNumber] = parseInt(line["@_hits"]);
                });

                sources.forEach((source: string) => {
                    callback(`${source}/${cls["@_filename"]}`, lineData);
                });
            });
        });
    });
}
