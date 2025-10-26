import { describe, it, expect } from 'vitest';
import { TacitPromise } from '../src';

describe('TacitPromise', () => {
  it('should create a promise with initial value', async () => {
    const result = await TacitPromise.begin(42).getValue();
    expect(result).toBe(42);
  });

  it('should thread context through chain', async () => {
    const { value, context } = await TacitPromise.create({ count: 0 })
      .then((_, ctx) => {
        ctx.count = 5;
        return 'done';
      })
      .toObject();

    expect(value).toBe('done');
    expect(context.count).toBe(5);
  });

  it('should pass value through then chain', async () => {
    const result = await TacitPromise.begin(5)
      .then((val) => val * 2)
      .then((val) => val + 10)
      .getValue();

    expect(result).toBe(20);
  });

  it('should access context in then callbacks', async () => {
    const result = await TacitPromise.create({ multiplier: 3 })
      .then(() => 10)
      .then((val, ctx) => val * ctx.multiplier)
      .getValue();

    expect(result).toBe(30);
  });

  it('should accumulate context across chain', async () => {
    const { context } = await TacitPromise.create<any>({ x: 1 })
      .then((_, ctx) => {
        ctx.y = 2;
        return 'a';
      })
      .then((_, ctx) => {
        ctx.z = 3;
        return 'b';
      })
      .toObject();

    expect(context.x).toBe(1);
    expect(context.y).toBe(2);
    expect(context.z).toBe(3);
  });

  it('should handle errors with context', async () => {
    try {
      await TacitPromise.create({ requestId: 'abc' })
        .then(() => {
          throw new Error('test error');
        })
        .getValue();
      
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toBe('test error');
    }
  });

  it('should catch errors with context available', async () => {
    const result = await TacitPromise.create({ requestId: 'abc' })
      .then(() => {
        throw new Error('oops');
      })
      .catch((err, ctx) => {
        return `Error for ${ctx.requestId}: ${err.message}`;
      })
      .getValue();

    expect(result).toBe('Error for abc: oops');
  });
});

describe('TacitPromise - tap', () => {
  it('should store value in context and pass it through', async () => {
    const { value, context } = await TacitPromise.begin(42)
      .tap('stored')
      .then((val) => val * 2)
      .toObject();

    expect(value).toBe(84);
    expect(context.stored).toBe(42);
  });

  it('should allow multiple taps', async () => {
    const { context } = await TacitPromise.begin(5)
      .tap('first')
      .then((val) => val * 2)
      .tap('second')
      .then((val) => val + 10)
      .tap('third')
      .toObject();

    expect(context.first).toBe(5);
    expect(context.second).toBe(10);
    expect(context.third).toBe(20);
  });

  it('should work with complex values', async () => {
    const obj = { name: 'Alice', age: 30 };
    const { context } = await TacitPromise.begin(obj)
      .tap('user')
      .toObject();

    expect(context.user).toEqual(obj);
    expect(context.user).toBe(obj); // Same reference
  });
});

describe('TacitPromise - map', () => {
  it('should transform value without accessing context', async () => {
    const result = await TacitPromise.begin(5)
      .map((x) => x * 2)
      .getValue();

    expect(result).toBe(10);
  });

  it('should chain multiple maps', async () => {
    const result = await TacitPromise.begin(5)
      .map((x) => x * 2)
      .map((x) => x + 10)
      .map((x) => x.toString())
      .getValue();

    expect(result).toBe('20');
  });

  it('should not affect context', async () => {
    const { value, context } = await TacitPromise.create({ count: 0 })
      .then(() => 10)
      .map((x) => x * 2)
      .then((_, ctx) => {
        ctx.count = 5;
        return 'done';
      })
      .toObject();

    expect(value).toBe('done');
    expect(context.count).toBe(5);
  });

  it('should work with type transformations', async () => {
    const result = await TacitPromise.begin(42)
      .map((n) => n.toString())
      .map((s) => s.length)
      .getValue();

    expect(result).toBe(2);
  });

  it('should work with pure functions', async () => {
    const double = (x: number) => x * 2;
    const square = (x: number) => x * x;
    
    const result = await TacitPromise.begin(5)
      .map(double)
      .map(square)
      .getValue();

    expect(result).toBe(100); // (5 * 2)^2
  });
});

describe('TacitPromise - when', () => {
  it('should execute function when predicate is true', async () => {
    const result = await TacitPromise.begin(10)
      .when(
        (val) => val > 5,
        (val) => val * 2
      )
      .getValue();

    expect(result).toBe(20);
  });

  it('should skip function when predicate is false', async () => {
    const result = await TacitPromise.begin(3)
      .when(
        (val) => val > 5,
        (val) => val * 2
      )
      .getValue();

    expect(result).toBe(3); // Unchanged
  });

  it('should allow access to context in predicate', async () => {
    const result = await TacitPromise.create({ debug: true })
      .then(() => 10)
      .when(
        (_, ctx) => ctx.debug,
        (val) => val * 100
      )
      .getValue();

    expect(result).toBe(1000);
  });

  it('should allow access to context in function', async () => {
    const result = await TacitPromise.create({ multiplier: 5 })
      .then(() => 10)
      .when(
        (val) => val > 5,
        (val, ctx) => val * ctx.multiplier
      )
      .getValue();

    expect(result).toBe(50);
  });

  it('should chain multiple whens', async () => {
    const result = await TacitPromise.begin(5)
      .when(
        (val) => val < 10,
        (val) => val + 10
      )
      .when(
        (val) => val > 10,
        (val) => val * 2
      )
      .getValue();

    expect(result).toBe(30); // 5 + 10 = 15, then 15 * 2 = 30
  });

  it('should handle promises returned from when', async () => {
    const result = await TacitPromise.begin(5)
      .when(
        (val) => val > 0,
        (val) => Promise.resolve(val * 2)
      )
      .getValue();

    expect(result).toBe(10);
  });
});

describe('TacitPromise - filter', () => {
  it('should filter array based on predicate', async () => {
    const result = await TacitPromise.begin([1, 2, 3, 4, 5])
      .filter((x) => x > 2)
      .getValue();

    expect(result).toEqual([3, 4, 5]);
  });

  it('should provide index to predicate', async () => {
    const result = await TacitPromise.begin(['a', 'b', 'c', 'd'])
      .filter((_, i) => i % 2 === 0)
      .getValue();

    expect(result).toEqual(['a', 'c']);
  });

  it('should provide context to predicate', async () => {
    const result = await TacitPromise.create({ minValue: 10 })
      .then(() => [5, 10, 15, 20])
      .filter((x, _, ctx) => x >= ctx.minValue)
      .getValue();

    expect(result).toEqual([10, 15, 20]);
  });

  it('should throw error if value is not an array', async () => {
    try {
      await TacitPromise.begin(42 as any)
        .filter((x: any) => x > 0)
        .getValue();
      
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toBe('filter requires an array value');
    }
  });

  it('should work with objects', async () => {
    interface User {
      name: string;
      age: number;
    }

    const users: User[] = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
    ];

    const result = await TacitPromise.begin(users)
      .filter((user) => user.age >= 30)
      .getValue();

    expect(result).toEqual([
      { name: 'Alice', age: 30 },
      { name: 'Charlie', age: 35 },
    ]);
  });

  it('should chain with other operations', async () => {
    const result = await TacitPromise.begin([1, 2, 3, 4, 5])
      .filter((x) => x > 2)
      .map((arr) => arr.length)
      .getValue();

    expect(result).toBe(3);
  });
});

describe('TacitPromise - mapcar', () => {
  it('should map function over array', async () => {
    const result = await TacitPromise.begin([1, 2, 3])
      .mapcar((x) => x * 2)
      .getValue();

    expect(result).toEqual([2, 4, 6]);
  });

  it('should provide index to mapper', async () => {
    const result = await TacitPromise.begin(['a', 'b', 'c'])
      .mapcar((x, i) => `${i}:${x}`)
      .getValue();

    expect(result).toEqual(['0:a', '1:b', '2:c']);
  });

  it('should provide context to mapper', async () => {
    const result = await TacitPromise.create({ prefix: 'item-' })
      .then(() => [1, 2, 3])
      .mapcar((x, _, ctx) => `${ctx.prefix}${x}`)
      .getValue();

    expect(result).toEqual(['item-1', 'item-2', 'item-3']);
  });

  it('should throw error if value is not an array', async () => {
    try {
      await TacitPromise.begin(42 as any)
        .mapcar((x: any) => x * 2)
        .getValue();
      
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toBe('mapcar requires an array value');
    }
  });

  it('should transform types', async () => {
    interface User {
      name: string;
      age: number;
    }

    const users: User[] = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];

    const result = await TacitPromise.begin(users)
      .mapcar((user) => user.name)
      .getValue();

    expect(result).toEqual(['Alice', 'Bob']);
  });

  it('should chain with filter', async () => {
    const result = await TacitPromise.begin([1, 2, 3, 4, 5])
      .filter((x) => x > 2)
      .mapcar((x) => x * 2)
      .getValue();

    expect(result).toEqual([6, 8, 10]);
  });

  it('should work with map after mapcar', async () => {
    const result = await TacitPromise.begin([1, 2, 3])
      .mapcar((x) => x * 2)
      .map((arr) => arr.reduce((sum, x) => sum + x, 0))
      .getValue();

    expect(result).toBe(12); // [2, 4, 6] -> 12
  });

  it('should work with pure functions', async () => {
    const double = (x: number) => x * 2;
    const square = (x: number) => x * x;

    const result = await TacitPromise.begin([1, 2, 3])
      .mapcar(double)
      .mapcar(square)
      .getValue();

    expect(result).toEqual([4, 16, 36]); // [2, 4, 6] -> [4, 16, 36]
  });
});

describe('TacitPromise - integration tests', () => {
  it('should combine tap, filter, and mapcar', async () => {
    interface FileContext {
      totalFiles?: number;
      filteredCount?: number;
    }

    const { value, context } = await TacitPromise.create<FileContext>({})
      .then(() => ['file1.js', 'file2.txt', 'file3.js', 'file4.md'])
      .tap('totalFiles')
      .filter((file) => file.endsWith('.js'))
      .tap('filteredCount')
      .mapcar((file) => file.toUpperCase())
      .toObject();

    expect(context.totalFiles).toEqual(['file1.js', 'file2.txt', 'file3.js', 'file4.md']);
    expect(context.filteredCount).toEqual(['file1.js', 'file3.js']);
    expect(value).toEqual(['FILE1.JS', 'FILE3.JS']);
  });

  it('should use when with map for conditional transformation', async () => {
    const result = await TacitPromise.create({ uppercase: true })
      .then(() => 'hello')
      .when(
        (_, ctx) => ctx.uppercase,
        (val) => val.toUpperCase()
      )
      .map((val) => `${val}!`)
      .getValue();

    expect(result).toBe('HELLO!');
  });

  it('should build a processing pipeline', async () => {
    interface Pipeline {
      step?: string;
      rawData?: number[];
      filtered?: number[];
      transformed?: string[];
    }

    const { value, context } = await TacitPromise.create<Pipeline>({ step: 'start' })
      .then(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      .tap('rawData')
      .filter((x) => x > 5)
      .tap('filtered')
      .mapcar((x) => `item-${x}`)
      .tap('transformed')
      .map((arr) => arr.join(', '))
      .toObject();

    expect(context.rawData).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(context.filtered).toEqual([6, 7, 8, 9, 10]);
    expect(context.transformed).toEqual(['item-6', 'item-7', 'item-8', 'item-9', 'item-10']);
    expect(value).toBe('item-6, item-7, item-8, item-9, item-10');
  });
});

describe('TacitPromise - extract', () => {
  it('should extract value from context', async () => {
    const result = await TacitPromise.create({ userId: 123, name: 'Alice' })
      .extract('userId')
      .getValue();

    expect(result).toBe(123);
  });

  it('should allow chaining after extract', async () => {
    const result = await TacitPromise.create({ count: 5 })
      .extract('count')
      .map(x => x * 2)
      .getValue();

    expect(result).toBe(10);
  });

  it('should preserve context', async () => {
    const { value, context } = await TacitPromise.create({ x: 1, y: 2 })
      .extract('x')
      .then((val, ctx) => {
        ctx.z = 3;
        return val;
      })
      .toObject();

    expect(value).toBe(1);
    expect(context).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('TacitPromise - when (updated)', () => {
  it('should execute function when predicate is true', async () => {
    const result = await TacitPromise.begin(10)
      .when(
        (val) => val > 5,
        (val) => val * 2
      )
      .getValue();

    expect(result).toBe(20);
  });

  it('should skip function when predicate is false', async () => {
    const result = await TacitPromise.begin(3)
      .when(
        (val) => val > 5,
        (val) => val * 2
      )
      .getValue();

    expect(result).toBe(3); // Unchanged
  });

  it('should handle async predicates', async () => {
    const asyncCheck = async (val: number) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return val > 5;
    };

    const result = await TacitPromise.begin(10)
      .when(asyncCheck, (val) => val * 2)
      .getValue();

    expect(result).toBe(20);
  });

  it('should handle async predicates that return false', async () => {
    const asyncCheck = async (val: number) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return val > 5;
    };

    const result = await TacitPromise.begin(3)
      .when(asyncCheck, (val) => val * 2)
      .getValue();

    expect(result).toBe(3); // Unchanged
  });

  it('should allow access to context in async predicate', async () => {
    const pathExists = async (path: string) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return path === '/tmp/test';
    };

    const result = await TacitPromise.create({ testPath: '/tmp/test' })
      .then(() => '/tmp/test')
      .when(pathExists, () => 'file exists')
      .getValue();

    expect(result).toBe('file exists');
  });

  it('should handle async functions after async predicate', async () => {
    const asyncCheck = async (val: number) => val > 5;
    const asyncTransform = async (val: number) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return val * 2;
    };

    const result = await TacitPromise.begin(10)
      .when(asyncCheck, asyncTransform)
      .getValue();

    expect(result).toBe(20);
  });
});
