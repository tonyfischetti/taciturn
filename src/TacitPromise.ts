/**
 * TacitPromise - Promises with implicit context threading
 */

export class TacitPromise<T, C extends Record<string, any> = Record<string, any>> extends Promise<T> {
  private _context: C;

  constructor(
    executor: (resolve: (value: T) => void, reject: (reason?: any) => void, context: C) => void,
    initialContext: C = {} as C
  ) {
    let contextRef = { ...initialContext };

    super((resolve, reject) => {
      const wrappedResolve = (value: any) => {
        resolve({ __value: value, __context: contextRef } as any);
      };

      const wrappedReject = (reason: any) => {
        reject({ __reason: reason, __context: contextRef });
      };

      executor(wrappedResolve, wrappedReject, contextRef);
    });

    this._context = contextRef;
  }

  override then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T, context: C) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any, context: C) => TResult2 | PromiseLike<TResult2>) | null
  ): TacitPromise<TResult1 | TResult2, C> {
    return new TacitPromise<TResult1 | TResult2, C>((resolve, reject, context) => {
      super.then(
        (wrapped: any) => {
          Object.assign(context, wrapped.__context);
          
          if (!onFulfilled) {
            resolve(wrapped.__value);
            return;
          }

          try {
            const result = onFulfilled(wrapped.__value, context);
            
            if (result && typeof (result as any).then === 'function') {
              (result as any).then(resolve, reject);
            } else {
              resolve(result as any);
            }
          } catch (error) {
            reject(error);
          }
        },
        (wrapped: any) => {
          Object.assign(context, wrapped.__context);
          
          if (!onRejected) {
            reject(wrapped.__reason);
            return;
          }

          try {
            const result = onRejected(wrapped.__reason, context);
            
            if (result && typeof (result as any).then === 'function') {
              (result as any).then(resolve, reject);
            } else {
              resolve(result as any);
            }
          } catch (error) {
            reject(error);
          }
        }
      );
    }, this._context);
  }

  override catch<TResult = never>(
    onRejected?: ((reason: any, context: C) => TResult | PromiseLike<TResult>) | null
  ): TacitPromise<T | TResult, C> {
    return this.then(null, onRejected);
  }

  getValue(): Promise<T> {
    return super.then(
      (wrapped: any) => wrapped.__value,
      (wrapped: any) => {
        if (wrapped?.__reason !== undefined) {
          throw wrapped.__reason;
        }
        throw wrapped;
      }
    );
  }

  getContext(): Promise<C> {
    return super.then((wrapped: any) => wrapped.__context);
  }

  toObject(): Promise<{ value: T; context: C }> {
    return super.then((wrapped: any) => ({
      value: wrapped.__value,
      context: wrapped.__context,
    }));
  }

  /* store a value in the context */
  tap(key: keyof C): TacitPromise<T, C> {
    return this.then((value, ctx) => {
      (ctx as any)[key] = value;
      return value;
    });
  }

  /* transform without context */
  map<U>(fn: (value: T) => U): TacitPromise<U, C> {
    return this.then((value) => fn(value));
  }

  /* conditional execution */
  when(
    predicate: (value: T, ctx: C) => boolean,
    fn: (value: T, ctx: C) => T | PromiseLike<T>
  ): TacitPromise<T, C> {
    return this.then((value, ctx) => {
      if (predicate(value, ctx)) {
        return fn(value, ctx);
      }
      return value;
    });
  }

  /* filter arrays */
  filter<Item>(
    fn: (item: Item, index: number, ctx: C) => boolean
  ): TacitPromise<Item[], C> {
    return this.then((value: any, ctx) => {
      if (!Array.isArray(value)) {
        throw new Error('filter requires an array value');
      }
      return value.filter((item, i) => fn(item, i, ctx));
    });
  }
  
  /* mapcar */
  mapcar<Item, Result>(
    fn: (item: Item, index: number, ctx: C) => Result
  ): TacitPromise<Result[], C> {
    return this.then((value: any, ctx) => {
      if (!Array.isArray(value)) {
        throw new Error('mapcar requires an array value');
      }
      return value.map((item, i) => fn(item, i, ctx));
    });
  }

  /**
    * Static methods
    */

  static create<C extends Record<string, any> = {}>(
    initialContext: C = {} as C
  ): TacitPromise<undefined, C> {
    return new TacitPromise((resolve) => resolve(undefined), initialContext);
  }

  static begin<T, C extends Record<string, any> = {}>(
    value: T,
    context: C = {} as C
  ): TacitPromise<T, C> {
    return new TacitPromise((resolve) => resolve(value), context);
  }
}
