# Transaction Simulation (v0, mock)

`Sim.simulateTransaction(tx, input)` estimates what a transaction would cost and whether it fits a spend limit. It is a pure function: no network, no clock, no randomness, and the transaction is never modified.

## Cost model

```
gas   = baseGas + zeroBytes * zeroByteGas + nonZeroBytes * nonZeroByteGas
fee   = gas * gasPrice
total = value + fee
```

Defaults are `21000`, `4`, and `16`. They are illustrative only and do not describe a real network. Pass `model` to use other numbers. All amounts are canonical decimal integer strings and are computed with `bigint`.

## Limit check

If `limit` (a policy `SpendLimit`) is given, the result includes `withinLimit`, `headroom`, and `excess`. By default only `value` is compared against `maxValue`, matching the policy engine. Set `includeFeeInLimit` to compare `value + fee` instead.

## Example

```ts
import { Sim } from 'mpc-custody-toolkit';

const result = Sim.simulateTransaction(
  { from: 'aa11', to: 'bb22', value: '1000', data: '00ff' },
  { gasPrice: '2', limit: { asset: 'ETH', maxValue: '5000' } }
);
// result.gasUnits === '21020', result.fee === '42040', result.limit.withinLimit === true
```
