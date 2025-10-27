# taciturn

[![npm version](https://badge.fury.io/js/taciturn.svg)](https://www.npmjs.com/package/taciturn)

> Promises for tacit programming. Thread context through your chains without
  the ceremony.

taciturn's `TacitPromise` is for sequential data pipelines with shared
context. If you're building something like a file processor, ETL tool,
or CLI with multiple transformation stages, it makes your code read
like a recipe instead of juggling variables. See the "Real-world example"
below.


## Installation

`npm install taciturn`


## Quick Start

```javascript
import { TacitPromise } from 'taciturn';

TacitPromise.create({ userId: 123 })
  .then((_, ctx) => fetch(`/api/user/${ctx.userId}`))
  .then(response => response.json())
  .tap('user')  // Store in context
  .then((user, ctx) => {
    console.log('Loaded user:', ctx.user);
    return user;
  });
```


## API

### Creating Promises

#### `TacitPromise.create(context)`
Start with just context, value is `undefined`.
```javascript
TacitPromise.create({ debug: true })
  .then((_, ctx) => console.log('Debug:', ctx.debug));
```

#### `TacitPromise.begin(value, context)`
Start with both value and context.
```javascript
TacitPromise.begin(42, { multiplier: 2 })
  .then((val, ctx) => val * ctx.multiplier);
```

### Core Methods

#### `.then(onFulfilled, onRejected)`
Like Promise.then, but callbacks receive `(value, context)`.
```javascript
.then((value, ctx) => {
  ctx.count++;
  return value * 2;
})
```

#### `.catch(onRejected)`
Like Promise.catch, but callback receives `(error, context)`.
```javascript
.catch((error, ctx) => {
  console.error(`Request ${ctx.requestId} failed:`, error);
})
```

#### `.finally(onFinally?)`
Execute a cleanup function after the promise settles (success or failure). The callback receives the context for cleanup operations.
```javascript
// Basic cleanup
TacitPromise.create({ db: connection })
  .then(doWork)
  .finally((ctx) => {
    if (ctx.db) {
      ctx.db.close();
    }
  })

// Always runs, even on error
TacitPromise.create({ file: handle })
  .then(processFile)
  .catch(handleError)
  .finally((ctx) => {
    ctx.file.close();
    console.log('File closed');
  })

// Real-world example: database cleanup
TacitPromise.create(context)
  .then(createDB)
  .tap('db')
  .then(createTables)
  .then(insertData)
  .finally((ctx) => {
    if (ctx.db) {
      ctx.db.close();
      console.log('Database closed');
    }
  })
  .catch(console.error)

// Multiple cleanup steps
TacitPromise.create({ db: null, cache: null })
  .then(initialize)
  .then(process)
  .finally((ctx) => {
    if (ctx.db) ctx.db.close();
    if (ctx.cache) ctx.cache.clear();
    console.log('Cleanup complete');
  })
```

`.finally()` is perfect for:
- Closing database connections
- Releasing file handles
- Clearing temporary files
- Logging completion (success or failure)
- Releasing locks or resources
- Cleanup that must always happen

The callback receives the full context, allowing access to any resources
that need cleanup. The value passes through unchanged, and errors continue
to propagate after cleanup.

### Helper Methods

#### `.tap(key)`
Store current value in context under `key`.
```javascript
TacitPromise.begin(42)
  .tap('original')
  .then((val, ctx) => {
    console.log('Started with:', ctx.original);
    return val * 2;
  });
```


#### `.when(predicate, fn)`
Conditionally execute a side effect. The value is always passed through unchanged.
```javascript
// Conditional side effect
TacitPromise.begin('/tmp/file.txt')
  .when(
    (path) => path.endsWith('.txt'),
    (path) => console.log('Processing text file:', path)
  )
  .then(processFile)  // Still gets '/tmp/file.txt'

// Async predicate and side effect
const fileExists = async (path) => {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

TacitPromise.begin('/tmp/old.db')
  .when(fileExists, fs.rm)  // Remove if exists
  .then(createNewDB)  // Still gets '/tmp/old.db'

// Modifying context
TacitPromise.create({ processed: 0 })
  .then(() => [1, 2, 3])
  .tap('items')
  .when(
    (items) => items.length > 0,
    (items, ctx) => { ctx.processed = items.length; }
  )
  .then((items, ctx) => {
    console.log(`Processed ${ctx.processed} items`);
    return items;
  })
```

`.when()` is perfect for:
- Conditional logging/debugging
- Conditional cleanup (removing files, etc.)
- Recording metrics in context
- Any side effect that shouldn't change the value

For conditional **transformations**, use `.then()` with an `if` statement:
```javascript
// Use .then() when you want to transform
.then((val) => {
  if (condition) {
    return transform(val);
  }
  return val;
})
```


#### `.focus(key)`
Shift focus to a specific property in context, making it the current value. The full context remains accessible.
```javascript
// Basic usage - zoom in on a context property
TacitPromise.create({ 
  rootPath: '/tmp',
  filename: 'data.txt' 
})
  .focus('rootPath')
  .then(root => `${root}/output`)
  .then((path, ctx) => `${path}/${ctx.filename}`)
  // Result: '/tmp/output/data.txt'

// Shifting focus multiple times in a pipeline
TacitPromise.create({ 
  codexRoot: '/projects/codex',
  dbName: 'codex.db' 
})
  .focus('codexRoot')              // Focus on root path
  .then(root => `${root}/data`)
  .then(dir => `${dir}/codex.db`)
  .tap('dbPath')                   // Store computed path
  .then(createDatabase)
  .focus('codexRoot')              // Shift focus back to root
  .then(getAllFiles)               // Process files from root
  // Full context still available throughout

// Using focus with filters
TacitPromise.create({
  users: [
    { name: 'Aisha', age: 30 },
    { name: 'Bing', age: 20 }
  ],
  minAge: 25,
  country: 'US'
})
  .focus('users')
  .filter((user, _, ctx) => user.age >= ctx.minAge)
  .filter((user, _, ctx) => user.country === ctx.country)
  // Focus on users, but still access minAge and country from context
```

`.focus()` is particularly useful when:
- Building file paths from components stored in context
- Processing one piece of data while referencing configuration
- Switching between different context values in a pipeline
- You want to "zoom in" on part of your context temporarily

The name "focus" emphasizes that you're shifting attention to a specific value while keeping the full context accessible - like focusing a camera on one subject while the background remains visible.


#### `.tee(label?, fields?, fn?)`
Inspect the current value and context without changing them. Like the Unix `tee` command, it allows you to "tap into" the pipeline for debugging, logging, or monitoring.
```javascript
// Basic usage - log value and full context
TacitPromise.begin(42)
  .tee('checkpoint')
  // Console: [checkpoint] { value: 42, context: {...} }

// Filter context to specific fields (reduce noise)
TacitPromise.create({ userId: 123, apiKey: 'secret', debug: true })
  .then(fetchUser)
  .tee('after-fetch', ['userId', 'debug'])
  // Console: [after-fetch] { value: {...}, context: { userId: 123, debug: true } }
  // Note: apiKey is hidden

// Show value only (no context)
TacitPromise.begin('data')
  .tee('value-only', [])
  // Console: [value-only] { value: 'data', context: {} }

// Custom formatter - pretty print
TacitPromise.create({ step: 1 })
  .then(() => ({ result: 'success' }))
  .tee('pretty', null, (data) => 
    console.log(JSON.stringify(data, null, 2))
  )

// Custom formatter with filtered context
TacitPromise.create({ userId: 123, requestId: 'abc', secret: 'xxx' })
  .then(processRequest)
  .tee('audit', ['userId', 'requestId'], (data) => 
    logger.info(data.label, { 
      value: data.value, 
      context: data.context 
    })
  )

// Multiple tee points in a pipeline for debugging
TacitPromise.create({ multiplier: 3 })
  .then(() => 5)
  .tee('start')
  .then(x => x * 2)
  .tee('doubled')
  .then((x, ctx) => x * ctx.multiplier)
  .tee('final', ['multiplier'])
  // Track value changes through the pipeline

// Real-world example: API request monitoring
TacitPromise.create({ 
  userId: 123, 
  requestId: 'req-456',
  startTime: Date.now()
})
  .then(validateRequest)
  .tee('validated', ['userId', 'requestId'])
  .then(fetchFromDB)
  .tee('fetched', ['userId', 'requestId'], (data) => {
    metrics.record('db_fetch', {
      userId: data.context.userId,
      duration: Date.now() - data.context.startTime
    });
  })
  .then(transformData)
  .tee('transformed', ['userId', 'requestId'])
  .catch((err, ctx) => {
    logger.error('Request failed', { 
      error: err, 
      userId: ctx.userId, 
      requestId: ctx.requestId 
    });
  })
```

**Parameters:**
- `label` (optional): String label for the output. Defaults to `"tee"`.
- `fields` (optional): Array of context keys to include. 
  - `null` or `undefined` = show full context (default)
  - `[]` = show no context
  - `['key1', 'key2']` = show only specified keys
- `fn` (optional): Custom output function. Receives `{ label, value, context }`. Defaults to `console.log`.

`.tee()` is perfect for:
- Debugging pipeline steps without breaking the chain
- Logging/auditing with filtered context (hide secrets)
- Recording metrics at specific points
- Verifying transformations during development
- Monitoring production data flow

The value always passes through unchanged, making it safe to add `.tee()` calls anywhere for inspection.


#### `.filter(fn)`
Filter array values. Supports both sync and async predicates. When predicates return promises, evaluates all in parallel.
```javascript
// Sync predicate
TacitPromise.begin([1, 2, 3, 4, 5])
  .filter(x => x > 2)
  // [3, 4, 5]

// Async predicate
const fileExists = async (path) => {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

TacitPromise.begin([
  '/tmp/file1.txt',
  '/tmp/missing.txt',
  '/tmp/file2.txt'
])
  .filter(fileExists)
  // Only includes files that exist
  // All checks run in parallel

// With context
TacitPromise.create({ minSize: 1024 })
  .then(() => files)
  .filter(async (file, _, ctx) => {
    const stats = await fs.stat(file.path);
    return stats.size >= ctx.minSize;
  })
  // Only files >= 1024 bytes

// Real-world example: filter valid API responses
const isValidUser = async (userId) => {
  try {
    const response = await fetch(`/api/users/${userId}`);
    return response.ok;
  } catch {
    return false;
  }
};

TacitPromise.begin([1, 2, 3, 4, 5])
  .filter(isValidUser)
  // Only IDs that correspond to valid users
  // All API calls made in parallel

// Combining with index
TacitPromise.begin(['a', 'b', 'c', 'd'])
  .filter(async (item, index) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return index % 2 === 0;
  })
  // ['a', 'c'] - even indices only
```

**Note:** All async predicates evaluate in parallel (via `Promise.all`). This is efficient but means:
- Side effects may occur in any order
- All predicates are evaluated even if some fail
- For sequential processing with early termination, use `.then()` with a `for` loop instead


#### `.map(fn, options?)`
Map over array values. Supports both sync and async mapper functions. When mappers return promises, waits for all to complete.

**Options:**
- `concurrency` (optional): Maximum number of concurrent async operations. Default: unlimited (all run in parallel)
```javascript
// Sync mapper
TacitPromise.begin([1, 2, 3])
  .map(x => x * 2)
  // [2, 4, 6]

// Async mapper - unlimited parallelism (default)
const fetchUserData = async (userId) => {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
};

TacitPromise.begin([1, 2, 3])
  .map(fetchUserData)
  // All 3 fetches happen simultaneously

// Async mapper - limited concurrency
TacitPromise.begin([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  .map(fetchUserData, { concurrency: 3 })
  // Maximum 3 fetches at a time
  // As each completes, next one starts

// Real-world example: reading files without overwhelming filesystem
const readFirstLine = async (fileObj) => {
  const contents = await fs.readFile(fileObj.fullPath, 'utf-8');
  const firstLine = contents.split('\n')[0];
  return { ...fileObj, firstLine };
};

TacitPromise.begin(allFiles)  // 10,000 files
  .map(readFirstLine, { concurrency: 100 })
  // Only 100 files read at once
  // Prevents file descriptor exhaustion and memory issues

// Sequential processing (concurrency: 1)
TacitPromise.begin(tasks)
  .map(processOneAtATime, { concurrency: 1 })
  // Processes one by one, in order

// With context
TacitPromise.create({ apiKey: 'secret', timeout: 5000 })
  .then(() => [1, 2, 3])
  .map(async (id, _, ctx) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ctx.timeout);
    
    const response = await fetch(`/api/data/${id}`, {
      headers: { 'Authorization': ctx.apiKey },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    return response.json();
  }, { concurrency: 5 })
```

**When to limit concurrency:**
- File I/O operations (prevents file descriptor exhaustion)
- Network requests to same host (be a good citizen, avoid rate limits)
- Database queries (respect connection pool limits)
- Memory-intensive operations (each operation loads large data)
- Any operation with limited system resources

**When unlimited is fine:**
- Pure computation (no I/O, just CPU)
- Small arrays (<100 items)
- Fast async operations
- Operations to different hosts/services

**Performance note:** Results always maintain input order regardless of
completion order. With concurrency limiting, operations start as previous
ones complete (queue-based), maintaining exactly N concurrent operations
for maximum efficiency.

**Note:** All async operations run in parallel (via `Promise.all`). If you
need sequential processing, use `.then()` with a `for` loop instead.

### Extraction Methods

#### `.getValue()`
Get just the value as a regular Promise.
```javascript
const value = await promise.getValue();
```

#### `.getContext()`
Get just the context as a regular Promise.
```javascript
const context = await promise.getContext();
```

#### `.toObject()`
Get both value and context.
```javascript
const { value, context } = await promise.toObject();
```

## Real-World Example

Building a database indexer:
```javascript
TacitPromise.create(context).
  then(log("making codex SQLite DB", consola.box)).

  then(getCodexRoot).
    catch(fatalCantFindCodexRoot).
    tap("codexRoot").

  then(updateBlacklistPaths).
    tap("blacklistedPaths").

  focus('codexRoot').
    then(root => `${root}/codex.db`).
    tap("codexDBPath").
  
  when(pathExistsP, removeOldDB).

  then(log("creating sqlite db")).
    then(createDB).
    catch(fatalCantOpenDB).
    tap('db').
    then(createTables).

  focus('codexRoot').
    then(getAllFilesRecursively).
    filter(filesOnly).
    map(addAltPathsAsKey).
    filter(notBlacklistedP).

  then(log("parsing tags")).
    map(addFirstLineAsKey, { concurrency: 10 }).
    map(addTags).
    map(addAFileID).

  then(log("inserting tags and files")).
    map(insertFile).
    map(insertTags).

  finally(closeDB).
  
  catch(consola.error).
  then(log("done", consola.success));
```


## What's in a name?

The name comes from *tacit programming* (point-free style), where you compose
functions without explicitly mentioning their arguments. TacitPromise
encourages this style by:

1. Threading context implicitly
2. Encouraging bare function references
3. Making pipelines read like declarative recipes


## TypeScript

Full TypeScript support with generics for both value and context types:
```typescript
interface MyContext {
  userId: number;
  debug: boolean;
}

const promise: TacitPromise = 
  TacitPromise.create({ userId: 123, debug: true });

```

## Development Status

⚠️ **Pre-1.0**: API may change. Feedback welcome!


## License

GPL-3

