import * as ts from 'typescript';
import { TSUtil } from './ts-compiler-api-utils';

/**
 * compiler options takes from the app tsconfig
 */
export const TS_CONFIG_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.CommonJS,
  types: ['node'],
  emitDecoratorMetadata: true,
  target: ts.ScriptTarget.ES2021,
};

export const getDomainEventKey = (
  classNode: ts.ClassDeclaration,
  methodNode: ts.MethodDeclaration
) => {
  return `${TSUtil.getNodeName(classNode)}.${TSUtil.getNodeName(methodNode)}`;
};

export const prettyPrintRecordObject = (
  obj: Record<string, string | string[]>
) => {
  for (const [key, value] of Object.entries(obj)) {
    const prettyValue = Array.isArray(value) ? value.join(', ') : value;
    console.log(`[${key}]: ${prettyValue}`);
  }
};
