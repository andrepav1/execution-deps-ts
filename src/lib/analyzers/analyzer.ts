import * as ts from 'typescript';
import { TSUtil } from '../ts-compiler-api-utils';
import { TS_CONFIG_OPTIONS } from '../utils';
import { ExecutionsManager, SingleExecution } from './provider-execution';

type AnalyzerConfigServiceProvider = {
  paths: string[];
  classRegex: string;
};

type AnalyzerConfigService = {
  name: string;
  handlers: AnalyzerConfigServiceProvider;
  writeModels: AnalyzerConfigServiceProvider;
  utils: Omit<AnalyzerConfigServiceProvider, 'classRegex'>;
  providers: Omit<AnalyzerConfigServiceProvider, 'classRegex'>;
};

export type AnalyzerConfig = {
  services: AnalyzerConfigService[];
};

/**
 * reusable class for analyzing multiple files for every class/function execution
 */
export class FileExecutionsAnalyzer {
  fileName: string;

  private _sourceFile: ts.SourceFile;
  private _program: ts.Program;

  /**
   * @see ExecutionsManager
   * Does not reset on {@link init}.
   */
  executionsManager: ExecutionsManager;

  constructor(executionsManager: ExecutionsManager) {
    this.executionsManager = executionsManager;
  }

  /**
   * Set file name and initialize program to analyze
   */
  init(fileName: string, dependencies: string[] = []) {
    this.fileName = fileName;

    this._program = ts.createProgram(
      [fileName, ...dependencies],
      TS_CONFIG_OPTIONS
    );
    this._sourceFile = this._program.getSourceFile(fileName);
  }

  /**
   * analyze provided file name
   */
  analyze(fileName: string, dependencies?: string[]) {
    this.init(fileName, dependencies);

    console.log(`Traversing [${this.fileName}]`);

    this._sourceFile.forEachChild((node) => {
      // analyze handler classes
      if (ts.isClassDeclaration(node)) {
        this.analyzeClass(node);
      }
      // analyze functions
      if (ts.isFunctionDeclaration(node)) {
        this.analyzeFunction(node);
      }
    });
  }

  /**
   * analyze function declaration
   */
  analyzeFunction(functionDeclaration: ts.FunctionDeclaration) {
    const fromFunction = functionDeclaration.name.text;
    let parametersMap: Record<string, string> = {};

    if (functionDeclaration.parameters) {
      this.analyzeMethodParameters(functionDeclaration);
      parametersMap = this.buildParametersMap(functionDeclaration.parameters);
    }

    function visit(node: ts.Node) {
      if (ts.isPropertyAccessExpression(node)) {
        if (ts.isIdentifier(node.name) && ts.isIdentifier(node.expression)) {
          this.executionsManager.set(
            SingleExecution.from({
              fromFunction,
              execClass: parametersMap[node.expression.text],
              execFunction: node.name.text,
            })
          );
        }
      }
      ts.forEachChild(node, visit.bind(this));
    }
    functionDeclaration.body &&
      ts.forEachChild(functionDeclaration.body, visit.bind(this));
  }

  buildParametersMap(parameters: ts.NodeArray<ts.ParameterDeclaration>) {
    const propertyToClass: Record<string, string> = {};

    parameters.forEach((node: ts.ParameterDeclaration) => {
      // ignore destructured params (for now)
      if (ts.isIdentifier(node.name)) {
        const propertyName = node.name.text;
        const propertyType = TSUtil.getTypeName(node);
        propertyToClass[propertyName] = propertyType;
      }
    });

    return propertyToClass;
  }

  analyzeClass(node: ts.ClassDeclaration) {
    let parametersMap = {};

    node.members.forEach((member) => {
      if (ts.isConstructorDeclaration(member) && member.parameters.length) {
        parametersMap = this.buildParametersMap(member.parameters);
      }

      // analyze all handler methods
      if (ts.isMethodDeclaration(member)) {
        this.analyzeMethod(node, member, parametersMap);
      }
    });
  }

  analyzeMethod(
    classNode: ts.ClassDeclaration,
    methodNode: ts.MethodDeclaration,
    parametersMap: Record<string, string>
  ) {
    if (methodNode.parameters) {
      this.analyzeMethodParameters(methodNode, classNode);
    }

    function visit(node: ts.Node) {
      this.findExecutions(classNode, methodNode, node, parametersMap);
      this.findEvents(node, methodNode, classNode);
      ts.forEachChild(node, visit.bind(this));
    }
    methodNode.body && ts.forEachChild(methodNode.body, visit.bind(this));
  }

  analyzeMethodParameters(
    methodNode: ts.MethodDeclaration | ts.FunctionDeclaration,
    classNode?: ts.ClassDeclaration
  ) {
    function visit(node: ts.Node) {
      if (ts.isIdentifier(node)) {
        this.findEvents(node, methodNode, classNode);
      }
      ts.forEachChild(node, visit.bind(this));
    }

    methodNode.parameters.forEach((parameter) =>
      ts.forEachChild(parameter, visit.bind(this))
    );
  }

  findExecutions(
    classNode: ts.ClassDeclaration,
    methodNode: ts.MethodDeclaration,
    node: ts.Node,
    propertyToClass: Record<string, string>
  ): void {
    const className = TSUtil.getNodeName(classNode);
    const methodName = TSUtil.getNodeName(methodNode);

    // CallExpression
    if (ts.isCallExpression(node)) {
      const leftHandSideExpression = node.expression;

      // CallExpression.Identifier
      if (ts.isIdentifier(leftHandSideExpression)) {
        // calling a normal util function - i.e. doSomething()
        this.executionsManager.set(
          SingleExecution.from({
            fromClass: className,
            fromFunction: methodName,
            execFunction: leftHandSideExpression.text,
          })
        );

        // CallExpression.PropertyAccessExpression
      } else if (ts.isPropertyAccessExpression(leftHandSideExpression)) {
        const leftLeftHandSideExpression = leftHandSideExpression.expression;

        // CallExpression.PropertyAccessExpression
        // .(ThisKeyword/Identifier)
        if (
          TSUtil.isThisKeyword(leftHandSideExpression.expression) &&
          ts.isIdentifier(leftHandSideExpression.name)
        ) {
          // calling a method from the same/super class - i.e. this.callMe()
          this.executionsManager.set(
            SingleExecution.from({
              fromClass: className,
              fromFunction: methodName,
              execClass: className, // TODO: this or base class
              execFunction: leftHandSideExpression.name.text,
            })
          );
        }

        // CallExpression.PropertyAccessExpression.PropertyAccessExpression
        if (ts.isPropertyAccessExpression(leftLeftHandSideExpression)) {
          // CallExpression.PropertyAccessExpression.PropertyAccessExpression
          // .(ThisKeyword/Identifier)
          if (
            TSUtil.isThisKeyword(leftLeftHandSideExpression.expression) &&
            ts.isIdentifier(leftLeftHandSideExpression.name)
          ) {
            // calling provider method - i.e. this.service.whatAmI()
            const execFunction = leftHandSideExpression.name.text;
            const providerVariable = leftLeftHandSideExpression.name.text;
            const execClass = propertyToClass[providerVariable];
            this.executionsManager.set(
              SingleExecution.from({
                fromClass: className,
                fromFunction: methodName,
                execClass,
                execFunction,
              })
            );
          }
        }
      }
    }
  }

  findEvents(
    node: ts.Node,
    methodNode: ts.MethodDeclaration | ts.FunctionDeclaration,
    classNode?: ts.ClassDeclaration
  ) {
    const methodName = TSUtil.getNodeName(methodNode);

    // is newExpression - i.e. new DomainEvent()
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      this.executionsManager.set(
        SingleExecution.from({
          fromClass: classNode?.name?.text,
          fromFunction: methodName,
          execClass: node.expression.text,
        })
      );
      // check every node's suffix
    } else if (ts.isIdentifier(node)) {
      if (
        node.text.endsWith('IntegrationEvent') ||
        node.text.endsWith('Command')
      ) {
        this.executionsManager.set(
          SingleExecution.from({
            fromClass: classNode?.name?.text,
            fromFunction: methodName,
            execClass: node.text,
          })
        );
      }
    }
  }
}
