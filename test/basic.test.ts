import { describe, it, expect, vi } from 'vitest';
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
  it('should pass through value even when condition is true', async () => {
    const sideEffect = vi.fn();
    
    const result = await TacitPromise.begin(10)
      .when(
        (val) => val > 5,
        (val) => { sideEffect(val); }
      )
      .getValue();

    expect(result).toBe(10);  // Original value
    expect(sideEffect).toHaveBeenCalledWith(10);
  });

  it('should pass through value when condition is false', async () => {
    const sideEffect = vi.fn();
    
    const result = await TacitPromise.begin(3)
      .when(
        (val) => val > 5,
        (val) => { sideEffect(val); }
      )
      .getValue();

    expect(result).toBe(3);  // Original value
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('should allow access to context in predicate', async () => {
    const sideEffect = vi.fn();

    const result = await TacitPromise.create({ debug: true })
      .then(() => 10)
      .when(
        (_, ctx) => ctx.debug,
        (val) => { sideEffect(val); }
      )
      .getValue();

    expect(result).toBe(10);
    expect(sideEffect).toHaveBeenCalledWith(10);
  });

  it('should allow access to context in function', async () => {
    const { value, context } = await TacitPromise.create<any>({ multiplier: 5 })
      .then(() => 10)
      .when(
        (val) => val > 5,
        (val, ctx) => { ctx.result = val * ctx.multiplier; }
      )
      .toObject();

    expect(value).toBe(10);  // Original value
    expect(context.result).toBe(50);  // Side effect in context
  });

  it('should handle async side effects', async () => {
    let effectRan = false;
    
    const asyncSideEffect = async (val: number) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      effectRan = true;
    };

    const result = await TacitPromise.begin(10)
      .when((val) => val > 5, asyncSideEffect)
      .getValue();

    expect(result).toBe(10);
    expect(effectRan).toBe(true);
  });

  it('should handle async predicates', async () => {
    const sideEffect = vi.fn();
    
    const asyncCheck = async (val: number) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return val > 5;
    };

    const result = await TacitPromise.begin(10)
      .when(asyncCheck, (val) => { sideEffect(val); })
      .getValue();

    expect(result).toBe(10);
    expect(sideEffect).toHaveBeenCalledWith(10);
  });

  it('should handle async predicates that return false', async () => {
    const sideEffect = vi.fn();
    
    const asyncCheck = async (val: number) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return val > 5;
    };

    const result = await TacitPromise.begin(3)
      .when(asyncCheck, (val) => { sideEffect(val); })
      .getValue();

    expect(result).toBe(3);
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('should handle async predicates with async side effects', async () => {
    let effectRan = false;
    
    const asyncCheck = async (val: number) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return val > 5;
    };
    
    const asyncSideEffect = async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      effectRan = true;
    };

    const result = await TacitPromise.begin(10)
      .when(asyncCheck, asyncSideEffect)
      .getValue();

    expect(result).toBe(10);
    expect(effectRan).toBe(true);
  });

  it('should allow context modification in side effect', async () => {
    const { value, context } = await TacitPromise.create<any>({ count: 0 })
      .then(() => 'test')
      .when(
        (val) => val === 'test',
        (_, ctx) => { ctx.count++; }
      )
      .toObject();

    expect(value).toBe('test');  // Original value
    expect(context.count).toBe(1);  // Context modified
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

it('should handle async predicates in filter', async () => {
  const asyncGreaterThan = async (x: number, threshold: number) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return x > threshold;
  };

  const result = await TacitPromise.begin([1, 2, 3, 4, 5])
    .filter(async (x) => asyncGreaterThan(x, 2))
    .getValue();

  expect(result).toEqual([3, 4, 5]);
});

it('should handle async predicates with context in filter', async () => {
  const fileExists = async (path: string) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return path.includes('exists');
  };

  const result = await TacitPromise.begin([
    'file-exists.txt',
    'missing.txt',
    'also-exists.txt'
  ])
    .filter(fileExists)
    .getValue();

  expect(result).toEqual(['file-exists.txt', 'also-exists.txt']);
});

it('should run filter predicates in parallel', async () => {
  const startTime = Date.now();
  
  const slowCheck = async (x: number) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return x > 2;
  };

  await TacitPromise.begin([1, 2, 3, 4])
    .filter(slowCheck)
    .getValue();

  const duration = Date.now() - startTime;
  
  // If sequential: 4 * 50ms = 200ms
  // If parallel: ~50ms
  expect(duration).toBeLessThan(100);
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

it('should handle async mappers', async () => {
  const asyncDouble = async (x: number) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return x * 2;
  };

  const result = await TacitPromise.begin([1, 2, 3])
    .mapcar(asyncDouble)
    .getValue();

  expect(result).toEqual([2, 4, 6]);
});

it('should handle async mappers with context', async () => {
  const asyncMultiply = async (x: number, _: number, ctx: any) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return x * ctx.multiplier;
  };

  const result = await TacitPromise.create({ multiplier: 3 })
    .then(() => [1, 2, 3])
    .mapcar(asyncMultiply)
    .getValue();

  expect(result).toEqual([3, 6, 9]);
});

it('should work with real file operations', async () => {
  // Mock file objects
  const files = [
    { path: 'file1.txt', content: 'line1\nline2' },
    { path: 'file2.txt', content: 'first\nsecond' }
  ];

  const readFirstLine = async (file: any) => {
    // Simulate async file read
    await new Promise(resolve => setTimeout(resolve, 5));
    const firstLine = file.content.split('\n')[0];
    return { ...file, firstLine };
  };

  const result = await TacitPromise.begin(files)
    .mapcar(readFirstLine)
    .getValue();

  expect(result).toEqual([
    { path: 'file1.txt', content: 'line1\nline2', firstLine: 'line1' },
    { path: 'file2.txt', content: 'first\nsecond', firstLine: 'first' }
  ]);
});

describe('TacitPromise - focus', () => {
  it('should focus value from context', async () => {
    const result = await TacitPromise.create({ userId: 123, name: 'Alice' })
      .focus('userId')
      .getValue();

    expect(result).toBe(123);
  });

  it('should focus different types', async () => {
    const result = await TacitPromise.create({ 
      name: 'Alice', 
      age: 30,
      active: true 
    })
      .focus('name')
      .getValue();

    expect(result).toBe('Alice');
  });

  it('should allow chaining after focus', async () => {
    const result = await TacitPromise.create({ count: 5 })
      .focus('count')
      .map(x => x * 2)
      .getValue();

    expect(result).toBe(10);
  });

  it('should preserve context after focus', async () => {
    const { value, context } = await TacitPromise.create({ x: 1, y: 2 })
      .focus('x')
      .then((val, ctx) => {
        ctx.z = 3;
        return val;
      })
      .toObject();

    expect(value).toBe(1);
    expect(context).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('should work in pipelines', async () => {
    const result = await TacitPromise.create({ 
      root: '/tmp',
      filename: 'test.txt' 
    })
      .focus('root')
      .map(root => `${root}/data`)
      .then((path, ctx) => `${path}/${ctx.filename}`)
      .getValue();

    expect(result).toBe('/tmp/data/test.txt');
  });

  it('should focus and use in filter', async () => {
    const result = await TacitPromise.create({ minAge: 25 })
      .then(() => [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 20 },
        { name: 'Charlie', age: 28 }
      ])
      .tap('users')
      .focus('minAge')
      .then((minAge, ctx) => {
        return ctx.users.filter((u: any) => u.age >= minAge);
      })
      .getValue();

    expect(result).toEqual([
      { name: 'Alice', age: 30 },
      { name: 'Charlie', age: 28 }
    ]);
  });
});

describe('TacitPromise - integration tests', () => {
  it('should combine tap, filter, and mapcar', async () => {
    interface FileContext {
      totalFiles?: any;
      filteredCount?: any;
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

  it('should use when with map for conditional side effects', async () => {
    const sideEffect = vi.fn();

    const result = await TacitPromise.create({ uppercase: true })
      .then(() => 'hello')
      .when(
        (_, ctx) => ctx.uppercase,
        (val) => { sideEffect(val.toUpperCase()); }
      )
      .map((val) => `${val}!`)
      .getValue();

    expect(result).toBe('hello!');
    expect(sideEffect).toHaveBeenCalledWith('HELLO');
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

  it('should combine focus and when for path operations', async () => {
    const fileRemoved = vi.fn();

    const result = await TacitPromise.create({ 
      root: '/tmp',
      dbName: 'test.db' 
    })
      .focus('root')
      .then((root, ctx) => `${root}/${ctx.dbName}`)  // Access dbName from context
      .when(
        (path) => path.endsWith('.db'),
        (path) => { fileRemoved(path); }
      )
      .getValue();

    expect(result).toBe('/tmp/test.db');
    expect(fileRemoved).toHaveBeenCalledWith('/tmp/test.db');
  });

  it('should handle real-world codex-like pipeline', async () => {
    interface CodexContext {
      codexRoot?: string;
      dbPath?: string;
      allFiles?: any[];
      processedCount?: number;
    }

    const mockFiles = [
      { name: 'file1.js', isFile: () => true },
      { name: 'file2.txt', isFile: () => true },
      { name: 'dir', isFile: () => false },
      { name: 'file3.js', isFile: () => true },
    ];

    const { value, context } = await TacitPromise.create<CodexContext>({ 
      codexRoot: '/tmp/codex' 
    })
      .focus('codexRoot')
      .map(root => `${root}/codex.db`)
      .tap('dbPath')
      .focus('codexRoot')
      .then(() => mockFiles)
      .tap('allFiles')
      .filter((file: any) => file.isFile())
      .filter((file: any) => file.name.endsWith('.js'))
      .when(
        (files) => files.length > 0,
        (files, ctx) => { ctx.processedCount = files.length; }
      )
      .mapcar((file: any) => file.name.toUpperCase())
      .toObject();

    expect(context.codexRoot).toBe('/tmp/codex');
    expect(context.dbPath).toBe('/tmp/codex/codex.db');
    expect(context.allFiles).toHaveLength(4);
    expect(context.processedCount).toBe(2);
    expect(value).toEqual(['FILE1.JS', 'FILE3.JS']);
  });
});

describe('TacitPromise - tee', () => {
  it('should output value and full context by default', async () => {
    const logs: any[] = [];
    const mockLog = (data: any) => logs.push(data);

    const result = await TacitPromise.create({ userId: 123, name: 'Alice' })
      .then(() => 'test-value')
      .tee('checkpoint', null, mockLog)
      .getValue();

    expect(result).toBe('test-value');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      label: 'checkpoint',
      value: 'test-value',
      context: { userId: 123, name: 'Alice' }
    });
  });

  it('should use default label "tee" when no label provided', async () => {
    const logs: any[] = [];
    const mockLog = (data: any) => logs.push(data);

    await TacitPromise.begin(42)
      .tee(undefined, null, mockLog)
      .getValue();

    expect(logs[0].label).toBe('tee');
  });

  it('should filter context to specific fields', async () => {
    const logs: any[] = [];
    const mockLog = (data: any) => logs.push(data);

    await TacitPromise.create({ userId: 123, name: 'Alice', secret: 'xxx' })
      .then(() => 'data')
      .tee('filtered', ['userId', 'name'], mockLog)
      .getValue();

    expect(logs[0].context).toEqual({
      userId: 123,
      name: 'Alice'
    });
    expect(logs[0].context.secret).toBeUndefined();
  });

  it('should show no context when fields is empty array', async () => {
    const logs: any[] = [];
    const mockLog = (data: any) => logs.push(data);

    await TacitPromise.create({ userId: 123, name: 'Alice' })
      .then(() => 'value')
      .tee('no-context', [], mockLog)
      .getValue();

    expect(logs[0].context).toEqual({});
  });

  it('should use console.log by default', async () => {
    const originalLog = console.log;
    const logs: any[] = [];
    console.log = (...args: any[]) => logs.push(args);

    await TacitPromise.create({ x: 1 })
      .then(() => 'test')
      .tee('default-log')
      .getValue();

    console.log = originalLog;

    expect(logs).toHaveLength(1);
    expect(logs[0][0]).toBe('[default-log]');
    expect(logs[0][1]).toEqual({
      value: 'test',
      context: { x: 1 }
    });
  });

  it('should pass through value unchanged', async () => {
    const result = await TacitPromise.begin(42)
      .tee('check', ['unused'], () => {})
      .map(x => x * 2)
      .getValue();

    expect(result).toBe(84);
  });

  it('should allow custom formatters', async () => {
    const logs: string[] = [];
    const customFormatter = (data: any) => {
      logs.push(JSON.stringify(data, null, 2));
    };

    await TacitPromise.create({ step: 1 })
      .then(() => 'result')
      .tee('custom', ['step'], customFormatter)
      .getValue();

    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.label).toBe('custom');
    expect(parsed.value).toBe('result');
    expect(parsed.context).toEqual({ step: 1 });
  });

  it('should work in pipelines for debugging', async () => {
    const logs: any[] = [];
    const mockLog = (data: any) => logs.push(data);

    await TacitPromise.create({ multiplier: 3 })
      .then(() => 5)
      .tee('initial', null, mockLog)
      .map(x => x * 2)
      .tee('after-double', null, mockLog)
      .then((x, ctx) => x * ctx.multiplier)
      .tee('final', ['multiplier'], mockLog)
      .getValue();

    expect(logs).toHaveLength(3);
    expect(logs[0].value).toBe(5);
    expect(logs[1].value).toBe(10);
    expect(logs[2].value).toBe(30);
    expect(logs[2].context).toEqual({ multiplier: 3 });
  });

  it('should handle complex context filtering', async () => {
    const logs: any[] = [];
    const mockLog = (data: any) => logs.push(data);

    interface ComplexContext {
      userId: number;
      requestId: string;
      metadata: {
        timestamp: number;
        source: string;
      };
      internal: string;
    }

    await TacitPromise.create<ComplexContext>({
      userId: 123,
      requestId: 'req-456',
      metadata: {
        timestamp: Date.now(),
        source: 'api'
      },
      internal: 'secret'
    })
      .then(() => 'response')
      .tee('api-response', ['userId', 'requestId', 'metadata'], mockLog)
      .getValue();

    expect(logs[0].context).toHaveProperty('userId', 123);
    expect(logs[0].context).toHaveProperty('requestId', 'req-456');
    expect(logs[0].context).toHaveProperty('metadata');
    expect(logs[0].context).not.toHaveProperty('internal');
  });

  it('should allow logging with no label and full context', async () => {
    const logs: any[] = [];
    const mockLog = (data: any) => logs.push(data);

    await TacitPromise.create({ x: 1 })
      .then(() => 'value')
      .tee(undefined, undefined, mockLog)
      .getValue();

    expect(logs[0].label).toBe('tee');
    expect(logs[0].context).toEqual({ x: 1 });
  });
});

