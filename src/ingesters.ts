import * as vscode from 'vscode';
import { XMLParser } from 'fast-xml-parser';

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
type Callback = (filename: string, lineData: number[]) => void;

export function ingest(
  uri: vscode.Uri,
  callback: Callback,
  thisArg?: any,
): void {
  /**
   * Ingest a file with the appropriate ingester, calling callback with results.
   *
   * The .coverage file is a sqlite database, whose contents are considered
   * an implementation detail, and cannot be trusted as a public interface.
   * Therefore, we do not try to parse it.
   */
  switch (uri.fsPath.split('.').reverse()[0]) {
    case 'xml': {
      _ingestXml(uri, callback);
      break;
    }

    // case "json":
    // 	JSON(uri, callback);
    // 	break;
    // case "lcov":
    // 	LCOV(uri, callback);
    // 	break;
    default: {
      console.error(`${uri.fsPath} filetype not supported`);
    }
  }
}

function _ingestXml(
  uri: vscode.Uri,
  callback: Callback,
  _backoff: Record<string, number> | undefined = undefined,
): void {
  console.info('Ingesting file:', uri.fsPath);

  if (_backoff === undefined) {
    _backoff = {
      delay: 1000,
      factor: 2,
      maxCumulativeDelay: 300_000, // 5min
      currentCumulativeDelay: 0,
    };
  } else {
    _backoff.currentCumulativeDelay += _backoff.delay;
    _backoff.delay *= _backoff.factor;
    if (_backoff.currentCumulativeDelay > _backoff.maxCumulativeDelay) {
      console.info('XML ingestion backoff limit reached, giving up');
      return;
    }
  }

  const parser: XMLParser = new XMLParser({
    ignoreAttributes: false,
    isArray(name, jpath, isLeafNode, isAttribute) {
      return ['source', 'package', 'class', 'line'].includes(name);
    },
  });

  void vscode.workspace.openTextDocument(uri).then((document) => {
    const xml = parser.parse(document.getText()) as Record<string, any>;
    if (Object.keys(xml).length === 0) {
      console.info(`XML file didn't parse; retrying in ${_backoff!.delay}ms`);
      setTimeout(() => {
        _ingestXml(uri, callback, _backoff);
      }, _backoff!.delay);
      return;
    }

    console.info('Parsed XML');

    const sources = xml.coverage.sources.source as string[];

    for (const pkg of xml.coverage.packages.package) {
      for (const cls of pkg.classes.class) {
        const lineData: number[] = [];

        if (!cls.lines.line) continue;

        for (const line of cls.lines.line) {
          const lineNumber =
            Number.parseInt(line['@_number'] as string, 10) - 1;
          while (lineData.length < lineNumber) lineData[lineData.length] = -1;
          lineData[lineNumber] = Number.parseInt(line['@_hits'] as string, 10);
        }

        for (const source of sources) {
          callback(`${source}/${String(cls['@_filename'])}`, lineData);
        }
      }
    }
  });
}
