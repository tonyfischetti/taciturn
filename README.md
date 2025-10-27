# taciturn

> Promises for tacit programming. Thread context through your chains without
  the ceremony.

[![npm version](https://badge.fury.io/js/taciturn.svg)](https://www.npmjs.com/package/taciturn)
[![CI](https://github.com/tonyfischetti/taciturn/actions/workflows/ci.yml/badge.svg)](https://github.com/tonyfischetti/taciturn/actions/workflows/ci.yml)


## Installation

npm install taciturn


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

#### `.map(fn)`
Transform value without accessing context.
```javascript
TacitPromise.begin(5)
  .map(x => x * 2)
  .map(x => x + 10);
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
  .map(root => `${root}/output`)
  .then((path, ctx) => `${path}/${ctx.filename}`)
  // Result: '/tmp/output/data.txt'

// Shifting focus multiple times in a pipeline
TacitPromise.create({ 
  codexRoot: '/projects/codex',
  dbName: 'codex.db' 
})
  .focus('codexRoot')              // Focus on root path
  .map(root => `${root}/data`)
  .map(dir => `${dir}/codex.db`)
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
  .map(x => x * 2)
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
Filter array values.
```javascript
TacitPromise.begin([1, 2, 3, 4, 5])
  .filter(x => x > 2)
  // [3, 4, 5]
```


#### `.mapcar(fn)`
Map over array values.
```javascript
TacitPromise.begin([1, 2, 3])
  .mapcar(x => x * 2)
  // [2, 4, 6]
```

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
TacitPromise.create({ 
  CODEX_ROOT: process.env.CODEX_ROOT,
  DEBUG: false 
})
  .then(removeOldDB)
  .then(createDB)
  .then(getAllFilesRecursively)
  .tap('allFiles')
  .filter(file => file.isFile())
  .filter(file => !isBlacklisted(file.path))
  .when(
    (_, ctx) => ctx.DEBUG,
    (files) => {
      console.log(`Processing ${files.length} files`);
      return files;
    }
  )
  .mapcar(file => addMetadata(file))
  .then(insertIntoDatabase)
  .then((_, ctx) => {
    console.log(`Indexed ${ctx.allFiles.length} files`);
  })
  .catch((err, ctx) => {
    console.error(`Failed at ${ctx.CODEX_ROOT}:`, err);
  });
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

