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
