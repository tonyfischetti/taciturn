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

  tee(
    label?: string,
    fields?: (keyof C)[] | null,
    fn?: (data: { label: string; value: T; context: Partial<C> | C }) => void
  ): TacitPromise<T, C> {
    return this.then((value, ctx) => {
      const prefix = label || 'tee';
      
      // null/undefined = full context, [] = no context, [...fields] = filtered
      let contextToShow: any;
      if (fields === null || fields === undefined) {
        contextToShow = ctx;
      } else if (fields.length === 0) {
        contextToShow = {};
      } else {
        contextToShow = Object.fromEntries(fields.map(key => [key, ctx[key]]));
      }
      
      const output = { label: prefix, value, context: contextToShow };
      
      if (fn) {
        fn(output);
      } else {
        console.log(`[${output.label}]`, { value: output.value, context: output.context });
      }
      
      return value;
    });
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
    predicate: (value: T, ctx: C) => boolean | PromiseLike<boolean>,
    fn: (value: T, ctx: C) => void | PromiseLike<void>
  ): TacitPromise<T, C> {
    return this.then(async (value, ctx) => {
      const condition = await predicate(value, ctx);
      if (condition) {
        await fn(value, ctx);
      }
      return value;  // Always return original value
    });
  }

  /* filter arrays */
  filter<Item>(
    fn: (item: Item, index: number, ctx: C) => boolean | PromiseLike<boolean>
  ): TacitPromise<Item[], C> {
    return this.then(async (value: any, ctx) => {
      if (!Array.isArray(value)) {
        throw new Error('filter requires an array value');
      }
      
      // Evaluate all predicates in parallel
      const results = await Promise.all(
        value.map((item, i) => fn(item, i, ctx))
      );
      
      // Filter based on results
      return value.filter((_, i) => results[i]);
    });
  }
  
  /* mapcar */
  mapcar<Item, Result>(
    fn: (item: Item, index: number, ctx: C) => Result | PromiseLike<Result>
  ): TacitPromise<Result[], C> {
    return this.then(async (value: any, ctx) => {
      if (!Array.isArray(value)) {
        throw new Error('mapcar requires an array value');
      }
      // Use Promise.all to wait for all async operations
      return Promise.all(value.map((item, i) => fn(item, i, ctx)));
    });
  }

  /** 
    * shift focus on something in context
    * (make it the current value
    */
  focus<K extends keyof C>(key: K): TacitPromise<C[K], C> {
    return this.then((_, ctx) => ctx[key]) as any;
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

