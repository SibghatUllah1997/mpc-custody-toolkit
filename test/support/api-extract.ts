// Walks src/index.ts with the TypeScript compiler and lists every public
// export as an ApiEntry. Kept under test/ so the runtime package never
// imports the compiler.
import ts from 'typescript';
import type { ApiEntry, ApiKind } from '../../src/docs/apiref.js';

function kindOf(symbol: ts.Symbol): ApiKind {
  const f = symbol.flags;
  if (f & ts.SymbolFlags.Function) return 'function';
  if (f & ts.SymbolFlags.Class) return 'class';
  if (f & ts.SymbolFlags.Enum) return 'enum';
  if (f & ts.SymbolFlags.Interface) return 'interface';
  if (f & ts.SymbolFlags.TypeAlias) return 'type';
  return 'const';
}

function resolve(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

const printer = ts.createPrinter({ removeComments: true, omitTrailingSemicolon: true });

function printType(node: ts.Node): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
}

function signatureOf(checker: ts.TypeChecker, symbol: ts.Symbol, kind: ApiKind): string {
  const decl = symbol.declarations?.[0];
  if (!decl) return '';
  const flags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType;
  if (kind === 'type' && ts.isTypeAliasDeclaration(decl)) {
    const params = decl.typeParameters ? `<${decl.typeParameters.map((p) => printType(p)).join(', ')}>` : '';
    return `${params}${printType(decl.type)}`;
  }
  if (kind === 'interface' || kind === 'class' || kind === 'enum') {
    return `${kind} ${symbol.getName()}`;
  }
  const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
  if (kind === 'function') {
    const sigs = type.getCallSignatures();
    return sigs.map((s) => checker.signatureToString(s, undefined, flags, ts.SignatureKind.Call)).join(' ; ');
  }
  return checker.typeToString(type, decl, flags);
}

function toEntry(checker: ts.TypeChecker, namespace: string, exported: ts.Symbol): ApiEntry {
  const symbol = resolve(checker, exported);
  const kind = kindOf(symbol);
  const summary = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  return {
    namespace,
    name: exported.getName(),
    kind,
    signature: signatureOf(checker, symbol, kind),
    ...(summary ? { summary } : {}),
  };
}

export function extractApiEntries(entryFile: string, tsconfigPath: string): ApiEntry[] {
  const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (cfg.error) throw new Error(ts.flattenDiagnosticMessageText(cfg.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, tsconfigPath.replace(/[^/\\]+$/, ''));
  const program = ts.createProgram([entryFile], { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryFile);
  if (!source) throw new Error(`cannot load ${entryFile}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`${entryFile} has no exports`);

  const out: ApiEntry[] = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const target = resolve(checker, exported);
    if (target.flags & ts.SymbolFlags.ValueModule) {
      for (const inner of checker.getExportsOfModule(target)) {
        out.push(toEntry(checker, exported.getName(), inner));
      }
    } else {
      out.push(toEntry(checker, '', exported));
    }
  }
  return out;
}
