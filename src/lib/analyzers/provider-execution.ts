type CollectionType =
  | 'fromFunction'
  | 'execFunction'
  | 'fromClass'
  | 'execClass'
  | 'origin'
  | 'destination';

type ExecutionsManagerOptions = {
  fromCollection: CollectionType;
  fullExecutionName?: boolean;
  filterByKeyFn?: (key: string) => boolean;
};

const EMPTY_VALUE = '_';

export const isEmpty = (value: string) => {
  return value === EMPTY_VALUE;
};

/**
 * Manages a group of executions.
 */
export class ExecutionsManager {
  /**
   * Collection with structure:
   * { [fromClass.fromFunction]: execClass.execFunction }
   */
  private _executionsByOrigin: Record<string, SingleExecution[]> = {};

  private _executionsByFromFunction: Record<string, SingleExecution[]> = {};
  private _executionsByFromClass: Record<string, SingleExecution[]> = {};
  private _executionsByExecFunction: Record<string, SingleExecution[]> = {};
  private _executionsByExecClass: Record<string, SingleExecution[]> = {};

  forEach(
    options: ExecutionsManagerOptions,
    callbackfn: (key: string, executions: SingleExecution[]) => void
  ) {
    const collection = this.getCollection(options.fromCollection);
    return Object.entries(collection).forEach(([key, executions]) => {
      if (options.filterByKeyFn(key)) {
        callbackfn(key, executions);
      }
    });
  }

  get(
    execution: SingleExecution,
    options: ExecutionsManagerOptions
  ): SingleExecution[] {
    const collection = this.getCollection(options.fromCollection);
    const key = execution.getKey(options.fromCollection);
    return collection[key];
  }

  getCollection(collection: CollectionType) {
    switch (collection) {
      case 'execClass':
        return this._executionsByExecClass;
      case 'execFunction':
        return this._executionsByExecFunction;
      case 'fromClass':
        return this._executionsByFromClass;
      case 'fromFunction':
        return this._executionsByFromFunction;
      case 'origin':
      case 'destination':
        return this._executionsByOrigin;
    }
  }

  set(execution: SingleExecution, collectionType?: CollectionType) {
    // if collectionType not provided, set ALL collections
    if (!collectionType) {
      this.set(execution, 'execClass');
      this.set(execution, 'execFunction');
      this.set(execution, 'fromClass');
      this.set(execution, 'fromFunction');
      this.set(execution, 'origin');
      return;
    }

    const collection = this.getCollection(collectionType);
    const key = execution.getKey(collectionType);
    if (Array.isArray(collection[key])) {
      collection[key].push(execution);
    } else {
      collection[key] = [execution];
    }
  }

  /**
   * Given an external function execution, find the class execution
   * @param externalExec
   * @returns
   */
  // find = (externalExec: SingleExecution): SingleExecution | undefined => {
  //   const executions = this.get(externalExec.className);

  //   if (executions.length) {
  //     return executions.find(
  //       ({ functionName }) => functionName === externalExec.functionName
  //     );
  //   }
  // };

  prettyPrint(options: ExecutionsManagerOptions) {
    const collection = this.getCollection(options.fromCollection);

    for (const [key, executions] of Object.entries(collection)) {
      const executionString = executions
        .map((exec) => {
          return options.fullExecutionName
            ? exec.getFullExecutionName()
            : exec.getExecutionName();
        })
        .join(', ');
      console.log(`[${key}]: ${executionString}`);
    }
  }
}

/**
 * Stores a single provider execution.
 */
export class SingleExecution {
  fromFunction?: string;
  execFunction?: string;
  fromClass?: string;
  execClass?: string;

  constructor(
    _fromFunction?: string,
    _execFunction?: string,
    _fromClass?: string,
    _execClass?: string
  ) {
    this.fromFunction = _fromFunction ?? EMPTY_VALUE;
    this.execFunction = _execFunction ?? EMPTY_VALUE;
    this.fromClass = _fromClass ?? EMPTY_VALUE;
    this.execClass = _execClass ?? EMPTY_VALUE;
  }

  getKey(type: CollectionType) {
    if (type === 'origin') {
      return `${this.fromClass}.${this.fromFunction}`;
    } else if (type === 'destination') {
      return `${this.execClass}.${this.execFunction}`;
    } else {
      return this[type];
    }
  }

  getExecutionName() {
    return `${this.execClass}.${this.execFunction}`
      .replace('_.', '')
      .replace('._', '');
  }

  getFullExecutionName() {
    return `${this.fromClass}.${this.fromFunction}`
      .replace('_.', '')
      .replace('._', '')
      .concat(' >> ')
      .concat(this.getExecutionName());
  }

  static from({
    fromFunction,
    execFunction,
    fromClass,
    execClass
  }: {
    fromClass?: string;
    fromFunction?: string;
    execClass?: string;
    execFunction?: string;
  }) {
    return new SingleExecution(
      fromFunction,
      execFunction,
      fromClass,
      execClass
    );
  }
}
