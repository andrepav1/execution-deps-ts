import * as fs from 'fs';
import { relative as getRelativePath } from 'path';
import * as dependencyTree from 'dependency-tree';

import { AnalyzerConfig, FileExecutionsAnalyzer } from './analyzers';
import {
  ExecutionsManager,
  SingleExecution,
  isEmpty,
} from './analyzers/provider-execution';

interface AnalyzerServiceComponentConfig {
  paths: string[];
  classRegex?: string;
}

interface DependencyTree {
  [handlers: string]: {
    domainEvents: Set<string>;
    integrationEvents: Set<string>;
  };
}

const normalizePaths = (paths: string[]): string[] => {
  return paths.reduce((acc, path) => {
    if (!fs.existsSync(path)) {
      return acc;
    }
    const stat = fs.statSync(path);

    if (stat.isDirectory()) {
      fs.readdirSync(path).forEach((file) => {
        acc.push(`${path}/${file}`);
      });
    } else if (stat.isFile()) {
      acc.push(path);
    } else {
      console.log(
        `I can't believe it. {${path}} should not exist... but.. IT DOES!! ...who are you?`
      );
    }
    return acc;
  }, []);
};

const analyzeWriteModels = (
  service: string,
  config: AnalyzerServiceComponentConfig,
  executionsManager: ExecutionsManager
) => {
  console.log(`Analyzing ${service} write models`);

  const analyzer = new FileExecutionsAnalyzer(executionsManager);
  const paths = normalizePaths(config.paths);
  paths.forEach((path) => {
    analyzer.analyze(path);
  });
};

const analyzeUtils = (
  service: string,
  config: AnalyzerServiceComponentConfig,
  executionsManager: ExecutionsManager
) => {
  console.log(`Analyzing ${service} utils`);

  const analyzer = new FileExecutionsAnalyzer(executionsManager);
  const paths = normalizePaths(config.paths);
  paths.forEach((path) => {
    analyzer.analyze(path);
  });
};

const analyzeHandlers = (
  service: string,
  config: AnalyzerServiceComponentConfig,
  executionsManager: ExecutionsManager
) => {
  console.log(`Analyzing ${service} handlers`);

  const analyzer = new FileExecutionsAnalyzer(executionsManager);
  const paths = normalizePaths(config.paths);
  paths.forEach((path) => {
    if (path.includes('.spec')) return;

    const tree = dependencyTree({
      directory: '.',
      filename: path,
      filter: (path) => path.indexOf('node_modules') === -1,
    });

    let depsRelativePaths: string[] = [];
    if (typeof tree === 'object') {
      // object will only contain handler at root
      const handlerDeps = Object.values(tree)[0];
      // get all first-level dependencies
      const handlerDepsList = Object.keys(handlerDeps);
      depsRelativePaths = handlerDepsList.map((path) =>
        getRelativePath(process.cwd(), path)
      );
    }
    // could create a ts Program with all dependencies and check each import recursively
    depsRelativePaths; // pass in handler analyzer??
    analyzer.analyze(path, depsRelativePaths);
  });
};

const buildDepsTree = (
  executionsManager: ExecutionsManager,
  rootRegex: string
): DependencyTree => {
  const tree: DependencyTree = {};
  const regex = new RegExp(rootRegex);
  executionsManager.forEach(
    { fromCollection: 'fromClass', filterByKeyFn: (key) => regex.test(key) },
    (className, executions) => {
      tree[className] = {
        domainEvents: new Set(),
        integrationEvents: new Set(),
      };

      function visit(execution: SingleExecution) {
        if (isEmpty(execution.execFunction)) {
          tree[className].domainEvents.add(execution.execClass);
          return;
        }
        const executions = executionsManager.get(execution, {
          fromCollection: 'destination',
        });

        executions && executions.forEach(visit);
      }

      executions && executions.forEach(visit);
    }
  );

  return tree;
};

export function main(config: AnalyzerConfig) {
  const results: DependencyTree[] = [];
  for (const service of config.services) {
    const executionsManager = new ExecutionsManager();

    analyzeWriteModels(service.name, service.writeModels, executionsManager);
    analyzeUtils(service.name, service.utils, executionsManager);
    analyzeHandlers(service.name, service.handlers, executionsManager);

    executionsManager.prettyPrint({
      fromCollection: 'origin',
      fullExecutionName: false,
    });

    // TODO switch handlers to services
    const result = buildDepsTree(
      executionsManager,
      service.handlers.classRegex
    );
    results.push(result);
  }
  // print to file
  results;

  // profit
}
